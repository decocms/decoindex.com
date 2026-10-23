import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { RefineDim, Share, Tile } from "~/types";
import { ProductDrawer, ProductTile, outbound, thumb } from "~/components/Product";
import { LibraryButton, LibraryDrawer, type LibraryTab } from "~/components/Library";
import { favorites, useFavorites } from "~/sdk/favorites";
import { ShareButton, SiteHeader } from "~/components/Share";
import { pastSearches, type Past } from "~/sdk/history";
import { bus, useBus } from "~/sdk/bus";
import { fetchRefine, myContext, track, useShopChat, type Dept, type Turn } from "~/sdk/useShopChat";

/** @titleBy label */
export interface Suggestion {
  /** @title Texto do chip */
  label: string;
  /** @title Mensagem enviada ao clicar (vazio = o próprio texto) */
  prompt?: string;
  /** @title Departamento (vazio = ambos) */
  dept?: Dept;
}

export interface Props {
  /** @title Título */
  headline?: string;
  /** @title Subtítulo */
  subheadline?: string;
  /** @title Placeholder do campo */
  placeholder?: string;
  /** @title Sugestões */
  suggestions?: Suggestion[];
  /** @title Aviso abaixo do campo */
  disclaimer?: string;
}

/**
 * The frozen turn this URL points at: `/c/{id}` (current), or `?s={id}` (links shared before /c/).
 * A `?q=` without `s` is a turn still running (or a deep link), so the path id doesn't apply.
 */
function snapshotOf(loc: Location): string | null {
  const p = new URLSearchParams(loc.search);
  if (p.get("s")) return p.get("s");
  if (p.get("q")) return null;
  return loc.pathname.match(/^\/c\/([0-9A-Za-z]{8})$/)?.[1] ?? null;
}

export default function ShopChat({
  headline = "Todas as marcas brasileiras que você ama. Um chat.",
  subheadline = "Diga o que procura e eu busco nos catálogos de FARM, Animale, Osklen, Reserva, FILA, New Balance e mais.",
  placeholder = "O que você está procurando?",
  suggestions = [],
  disclaimer = "Preços de catálogo. Estoque, frete e preço final são confirmados na loja.",
}: Props) {
  // /c/{id}: the route's loader already read the snapshot (for <head>); start from it.
  const initial = useRouterState({ select: (st) => (st.matches.find((m) => m.routeId === "/")?.loaderData as { share?: Share | null } | undefined)?.share ?? null });
  const { turns, model, chatId, send, similarTo, restore, reset } = useShopChat(initial);
  const { dept } = useBus();
  const setDept = (d: Dept) => bus.set({ dept: d });
  const [open, setOpen] = useState<Tile | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  /** Partner store the shopper came from (?store=, set by embed.js). */
  const [store, setStore] = useState<string>();
  /**
   * Which turn is on screen: an index into `turns`, or -1 for the home. Every
   * question pushes a history entry, so Back steps through earlier answers
   * (already in memory, no new model call) and finally back to the home.
   */
  const [view, setView] = useState(initial ? 0 : -1);
  const started = view >= 0 && turns.length > 0;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  /** Where the home was scrolled when a card or idea left it: Back returns to that card. */
  const homeY = useRef(0);
  const pushTurn = (turn: number, q: string, d: Dept = dept) => {
    if (view < 0) homeY.current = scrollY;
    const p = new URLSearchParams(location.search);
    p.set("q", q);
    p.set("dept", d);
    p.delete("s"); // the new turn gets its own /c/{id} when it finishes
    // Same path, new query: changing the path here (/c/x → /) switched routes, remounted the chat
    // and sent the follow-up as a brand-new conversation. Only the finished turn moves to /c/{id}.
    // Asked from inside the drawer: take over its history entry, so Back skips the closed drawer.
    if (history.state?.layer) history.replaceState({ turn }, "", `?${p}`);
    else history.pushState({ turn }, "", `?${p}`);
    setView(turn);
  };

  // Registered once, calling the latest handler through a ref. Re-adding it on every render lost
  // Back: the router's own popstate listener re-renders synchronously mid-dispatch, our effect
  // swapped the listener during that dispatch, and the DOM calls neither the removed nor the
  // added one. The URL went home while the results stayed on screen.
  const onPopRef = useRef<(e: PopStateEvent) => void>(() => {});
  useEffect(() => {
    const h = (e: PopStateEvent) => onPopRef.current(e);
    addEventListener("popstate", h);
    return () => removeEventListener("popstate", h);
  }, []);
  onPopRef.current = (e: PopStateEvent) => {
    if (e.state?.layer) return; // an overlay's own entry (drawer, gallery): it handles itself
    const p = new URLSearchParams(location.search);
    const q = p.get("q");
    const snap = snapshotOf(location);
    const turn: number = typeof e.state?.turn === "number" ? e.state.turn : q || snap ? 0 : -1;
    if (turn >= 0 && turn >= turnsRef.current.length && (q || snap)) {
      // Forward into a turn we no longer hold (the chat was reset): reopen its snapshot, or ask again.
      const at = turnsRef.current.length;
      setView(at);
      if (snap) void restore(snap, at).then((ok) => { if (!ok && q) send(q, at, (p.get("dept") as Dept) || dept, store); });
      else if (q) send(q, at, (p.get("dept") as Dept) || dept, store);
      return;
    }
    setOpen(null);
    setView(turn);
    // The router restores scroll before the home has re-rendered, so it lands short. Redo it after.
    if (turn < 0) requestAnimationFrame(() => scrollTo(0, homeY.current));
  };

  // When the turn on screen is frozen, its URL becomes /c/{id}: copying the address bar shares
  // exactly these picks, like the Share button, instead of re-running the search.
  const onScreen = view >= 0 ? turns[view] : undefined;

  // Every search that finishes goes into this device's history (deduped by snapshot id).
  const saved = useRef(new Set<string>());
  useEffect(() => {
    for (const t of turns) {
      if (!t.live || !t.done || !t.shareId || saved.current.has(t.shareId)) continue;
      saved.current.add(t.shareId);
      pastSearches.add(t, dept);
    }
  }, [turns]);

  const [library, setLibrary] = useState<LibraryTab | null>(null);
  const favLists = useFavorites();
  const favIds = useMemo(() => new Set(favLists.flatMap((l) => l.items.map((t) => t.id))), [favLists]);
  /** A piece goes into the list of the conversation it came from, named after its first question. */
  const toggleFav = (t: Tile) => {
    const on = favorites.toggle(t, turns[0]?.user ?? onScreen?.user ?? "");
    track("shop.fav", { chat: chatId(), id: t.id, on });
  };
  /**
   * Reopen a past search as a new conversation. The drawer's own history entry is replaced (not
   * popped), so Back from the reopened search goes to wherever the shopper was before the drawer.
   */
  const openPast = (p: Past) => {
    history.replaceState({ turn: 0 }, "", `/c/${p.id}`);
    setLibrary(null);
    setOpen(null);
    setView(0);
    if (p.dept === "feminino" || p.dept === "masculino") setDept(p.dept);
    void restore(p.id, 0);
  };
  useEffect(() => {
    const id = onScreen?.shareId;
    if (!id || location.pathname === `/c/${id}`) return;
    history.replaceState(history.state, "", `/c/${id}${store ? `?store=${encodeURIComponent(store)}` : ""}`);
  }, [onScreen?.shareId]);

  // ?q= makes a search shareable and lets the home page deep-link a prompt.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return; // effects run twice in dev; a deep link must send once
    booted.current = true;
    const p = new URLSearchParams(location.search);
    const d = p.get("dept");
    if (d === "masculino" || d === "feminino") setDept(d);
    const s = p.get("store") ?? undefined;
    setStore(s);
    const q = p.get("q");
    const snap = snapshotOf(location);
    if (initial && snap === initial.id) {
      // Already on screen from the server's HTML.
      history.replaceState({ turn: 0 }, "");
      if (initial.dept) setDept(initial.dept);
    } else if (q || snap) {
      history.replaceState({ turn: 0 }, "");
      setView(0);
      // ?s= is what someone saw and copied: show exactly that. Only a bare ?q= runs a new search.
      if (snap)
        void restore(snap, 0).then((ok) => {
          if (ok?.dept) setDept(ok.dept);
          else if (!ok && q) send(q, 0, (d as Dept) || "feminino", s);
        });
      else if (q) send(q, 0, (d as Dept) || "feminino", s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asking from turn `view` keeps turns 0..view and drops what came after it
  // (from the home, view = -1: a fresh conversation), exactly like browser history.
  const ask = (text: string, context?: string[], d: Dept = dept) => {
    setOpen(null);
    setRefining(null);
    const keep = view + 1;
    pushTurn(keep, text, d);
    send(text, keep, d, store, context);
  };

  /**
   * "Refinar ✨". Forced (the button): always show what Jev understood. Otherwise only for a new
   * conversation with a real sentence, and only when something that matters is unknown: then we
   * ask before searching ("de tarde ou de noite?") instead of guessing.
   */
  const [refining, setRefining] = useState<{ text: string; dims: RefineDim[] } | null>(null);
  /** Closing the sheet without searching puts the request back in the composer (remounted by key). */
  const [draft, setDraft] = useState({ text: "", key: 0 });
  const [thinking, setThinking] = useState(false);
  const askOrRefine = async (text: string, force = false) => {
    if (!force && (view >= 0 || text.length < AUTO_REFINE_MIN)) return ask(text);
    setThinking(true);
    const res = await fetchRefine(text, dept, chatId());
    setThinking(false);
    // "roupa para solteiro" with the toggle on Feminino: the request says who it's for, follow it.
    const d = res?.dept ?? dept;
    if (d !== dept) setDept(d);
    const dims = res?.dims;
    if (dims && (force ? dims.length > 0 : dims.some((x) => x.ask))) {
      setRefining({ text, dims });
      track("shop.enrich.shown", { chat: chatId(), forced: force, asked: dims.filter((x) => x.ask).map((x) => x.key) });
    } else ask(text, undefined, d);
  };
  const more = (t: Tile) => {
    setOpen(null);
    const keep = view + 1;
    pushTurn(keep, `Mais opções parecidas com "${t.title}" da ${t.brand}.`);
    similarTo(t, keep, dept);
  };
  /**
   * 👍 / 👎 on a piece, for the search on screen: the labelled data a better ranking learns from
   * ("for this ask, this SKU was wrong"). A 👎 also takes it off the grid.
   */
  const [votes, setVotes] = useState<Record<string, boolean>>({});
  const vote = (t: Tile, up: boolean) => {
    const again = votes[t.id] === up;
    setVotes((v) => {
      const n = { ...v };
      if (again) delete n[t.id];
      else n[t.id] = up;
      return n;
    });
    if (again) return; // a second tap on the same thumb takes the vote back, unlogged
    if (!up) {
      setHidden((h) => new Set(h).add(t.id));
      setOpen(null);
    }
    const turn = onScreen;
    track("shop.vote", { chat: chatId(), model, id: t.id, up, q: turn?.user, context: turn?.context, pos: turn?.curated?.indexOf(t.id) ?? -1 });
  };

  // Cards in other sections (Showcase) ask through the bus; always run the latest `ask`.
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => bus.onAsk((t) => askRef.current(t)), []);
  useEffect(() => {
    bus.set({ started });
  }, [started]);

  /** A suggested next step ("Só sutiã com aro"): a follow-up question. */
  const followUp = (r: string) => {
    track("shop.refine", { chat: chatId(), model, text: r });
    ask(r);
  };

  /** Details picked beside the result ("clima: frio") ask the same question again with it, in place. */
  const refineHere = (details: string[]) => {
    const t = onScreen;
    if (!t || !details.length) return;
    setOpen(null);
    track("shop.enrich.inline", { chat: chatId(), details });
    send(t.user, view, dept, store, [...(t.context ?? []), ...details]);
  };

  /** Switching Feminino/Masculino over a result asks the same question again in that department, in place. */
  const switchDept = (d: Dept) => {
    if (d === dept) return;
    setDept(d);
    const t = onScreen;
    if (!t || t.seed) return;
    setOpen(null);
    const p = new URLSearchParams(location.search);
    p.set("q", t.user);
    p.set("dept", d);
    p.delete("s");
    history.replaceState(history.state, "", `?${p}`);
    send(t.user, view, d, store, t.context);
  };

  const chips = suggestions.filter((s) => !s.dept || s.dept === dept);

  return (
    <section className={`overflow-x-clip ${started ? "min-h-dvh" : ""}`}>
      <SiteHeader
        onHome={() => {
          // The logo starts a new conversation; earlier entries re-ask if revisited.
          reset();
          history.pushState({ turn: -1 }, "", "/"); // home is "/", not the /c/{id} we were on
          setView(-1);
        }}
        right={
          <span className="flex items-center gap-1">
            <LibraryButton onClick={() => setLibrary("favoritos")} />
            {started && <DeptToggle value={dept} onChange={switchDept} />}
          </span>
        }
      />

      {!started ? (
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-5 pb-10 pt-[8vh] text-center md:pt-[11vh]">
          {/* Soft halo behind the composer, the one bit of color on a monochrome page. */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[52%] -z-10 h-[340px] w-[min(900px,100vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(217,249,157,0.45),rgba(196,181,253,0.18)_55%,transparent)] blur-2xl" />
          <h1 className="animate-rise font-medium tracking-tight text-[2.4rem] leading-[1.02] tracking-[-0.03em] text-balance md:text-7xl">{headline}</h1>
          <p className="mt-5 max-w-xl animate-rise text-base text-ink-soft text-pretty md:text-lg" style={{ animationDelay: "80ms" }}>
            {subheadline}
          </p>
          <div className="mt-8 animate-rise" style={{ animationDelay: "120ms" }}>
            <DeptToggle value={dept} onChange={setDept} />
          </div>
          <div className="mt-5 w-full animate-rise" style={{ animationDelay: "160ms" }}>
            <Composer key={draft.key} initialText={draft.text} placeholder={placeholder} onSend={(t) => askOrRefine(t)} onRefine={(t) => askOrRefine(t, true)} busy={thinking} autoFocus large />
          </div>
          {chips.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {chips.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => ask(s.prompt || s.label)}
                  className="tap-scale rounded-full border border-line bg-card px-3.5 py-2 text-sm text-ink-soft transition hover:border-ink/40 hover:text-ink"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <MyContext />
          <p className="mt-6 text-xs text-ink-soft/80">
            {disclaimer}{" "}
            <a href="/como-funciona" className="underline decoration-ink/20 underline-offset-2 hover:text-ink">
              Como funciona →
            </a>
          </p>
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-28 pt-5 md:px-8 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-10">
          <aside className="lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <Thread turns={turns.slice(0, view + 1)} model={model} chatId={chatId()} onAsk={followUp} />
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 frost p-3 lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0 lg:[backdrop-filter:none]">
              <Composer placeholder="Refine: mais barato, outra cor, só tênis…" onSend={ask} />
            </div>
            {onScreen?.done && <InlineRefine key={`${onScreen.key}:${dept}`} text={onScreen.seed ? undefined : onScreen.user} dept={dept} context={onScreen.context} suggestions={onScreen.refinements} onSuggest={followUp} onPick={refineHere} />}
          </aside>
          <Results turn={turns[Math.min(view, turns.length - 1)]} hidden={hidden} favIds={favIds} onFav={toggleFav} onOpen={(t) => { setOpen(t); track("shop.open", { chat: chatId(), model, id: t.id }); }} onMore={more} votes={votes} onVote={vote} onBroken={(t) => setHidden((h) => new Set(h).add(t.id))} />
        </div>
      )}

      {library && (
        <LibraryDrawer
          initial={library}
          onOpen={openPast}
          onClose={() => setLibrary(null)}
          onOpenTile={(t) => {
            // Hand the drawer's history entry over to the product view (same layer), so one Back closes it.
            history.replaceState({ turn: history.state?.turn }, "");
            setLibrary(null);
            setOpen(t);
          }}
        />
      )}
      {refining && (
        <RefineSheet
          text={refining.text}
          dims={refining.dims}
          onClose={() => {
            setDraft((d) => ({ text: refining.text, key: d.key + 1 }));
            setRefining(null);
          }}
          onSearch={(context) => {
            track("shop.enrich.search", { chat: chatId(), context });
            ask(refining.text, context);
          }}
        />
      )}
      {open && (
        <ProductDrawer
          fav={favIds.has(open.id)}
          onFav={() => toggleFav(open)}
          vote={votes[open.id]}
          onVote={(up) => vote(open, up)}
          t={open}
          href={outbound(open, chatId(), model)}
          onClose={() => setOpen(null)}
          onMore={() => more(open)}
          onChange={(what) => ask(`Como "${open.title}" da ${open.brand}, mas ${what}.`)}
        />
      )}
    </section>
  );
}

function DeptToggle({ value, onChange }: { value: Dept; onChange: (d: Dept) => void }) {
  return (
    <div role="radiogroup" aria-label="Departamento" className="flex rounded-full border border-line bg-card p-0.5 text-[13px] sm:text-sm">
      {(["feminino", "masculino"] as const).map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={`rounded-full px-2.5 py-1.5 capitalize transition max-[359px]:px-2 sm:px-3.5 ${value === d ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function Composer({
  placeholder,
  onSend,
  onRefine,
  busy,
  autoFocus,
  large,
  initialText = "",
}: {
  initialText?: string;
  placeholder: string;
  onSend: (t: string) => void;
  onRefine?: (t: string) => void;
  busy?: boolean;
  autoFocus?: boolean;
  large?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [hint, setHint] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const short = text.trim().length < REFINE_MIN;
  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setText("");
  };
  const refine = () => {
    if (busy || !onRefine) return;
    // A tap on the greyed-out button says why, for a few seconds (phones have no hover).
    if (short) {
      setHint(true);
      setTimeout(() => setHint(false), 3_000);
      return;
    }
    // The text stays while the sheet is open: clearing it made the button "short" under the mouse
    // and popped the hint. A search from the sheet leaves the home anyway.
    onRefine(text.trim());
  };
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className={`flex flex-wrap items-end gap-2 rounded-[28px] border border-line bg-card shadow-[0_8px_30px_-14px_rgba(0,0,0,0.25)] transition focus-within:border-ink/40 sm:flex-nowrap ${large ? "p-2.5 pl-6" : "p-1.5 pl-4"}`}
    >
      <textarea
        ref={ref}
        value={text}
        rows={1}
        autoFocus={autoFocus}
        enterKeyHint={onRefine && !short ? "next" : "search"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey) return;
          e.preventDefault();
          // On the home, a real sentence goes through Refinar first; short ones search directly.
          if (onRefine && !short) refine();
          else submit();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        // Phones: the text gets the full first row, the buttons sit under it (they used to cut the placeholder).
        className={`max-h-40 min-w-0 resize-none bg-transparent outline-none placeholder:text-ink-soft/70 field-sizing-content ${onRefine ? "basis-full sm:basis-0" : ""} flex-1 ${large ? "py-3 text-lg" : "py-2.5 text-sm"}`}
      />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {onRefine && (
          // Always there, so people learn it exists; until the request is a sentence it explains itself.
          <span className="group relative">
            <button
              type="button"
              aria-disabled={short || busy}
              aria-describedby={short ? "refine-hint" : undefined}
              onClick={refine}
              className={`rounded-full border border-line px-3 font-medium transition ${large ? "py-2 text-sm" : "py-1.5 text-xs"} ${short || busy ? "cursor-default text-ink-soft/50" : "tap-scale text-ink hover:border-ink"}`}
            >
              Refinar ✨
            </button>
            {short && (
              <span
                id="refine-hint"
                role="tooltip"
                className={`pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-56 rounded-xl bg-ink px-3 py-2 text-left text-xs leading-snug text-white shadow-lg transition group-hover:opacity-100 ${hint ? "opacity-100" : "opacity-0"}`}
              >
                Escreva um pouco mais (a ocasião, pra quem é, onde) e eu te ajudo a refinar antes de buscar.
              </span>
            )}
          </span>
        )}
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label="Buscar"
          className={`grid shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-ink disabled:opacity-30 ${large ? "size-12" : "size-10"}`}
        >
          {busy ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          )}
        </button>
      </div>
    </form>
  );
}

function Thread({ turns, model, chatId, onAsk }: { turns: Turn[]; model?: string; chatId: string; onAsk: (text: string) => void }) {
  const [voted, setVoted] = useState<Record<number, boolean>>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  return (
    <ol className="flex flex-col gap-5" aria-live="polite">
      {turns.map((t, i) => (
        // Phones show only the latest turn, so the grid stays above the fold.
        <li key={t.key} className={`flex-col gap-2.5 ${i === turns.length - 1 ? "flex" : "hidden lg:flex"}`}>
          {t.seed ? (
            <div className="flex max-w-[85%] items-center gap-3 self-end rounded-2xl rounded-br-md bg-ink p-2 pr-4 text-paper">
              {t.seed.images[0] && <img src={thumb(t.seed.images[0], 160)} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 text-sm">
                <p className="text-[11px] uppercase tracking-[0.08em] text-paper/60">Mais como este</p>
                <p className="line-clamp-2 leading-snug">
                  {t.seed.brand} · {t.seed.title}
                </p>
              </div>
            </div>
          ) : (
            <p className="self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">{t.user}</p>
          )}
          {!!t.context?.length && (
            <div className="flex flex-wrap justify-end gap-1">
              {t.context.map((c) => (
                <span key={c} className="rounded-full bg-[#f2f2f2] px-2.5 py-1 text-[11px] text-ink-soft">{c}</span>
              ))}
            </div>
          )}
          {!t.answer && !t.done && <Steps steps={t.steps?.length ? t.steps : [t.status ?? "Pensando…"]} />}
          {t.answer && <p className="text-[15px] font-medium leading-snug tracking-tight lg:text-lg">{t.answer}</p>}
          {t.done && !!t.refinements?.length && (
            // Desktop shows them in the Refinar panel under the composer, next to the dimension chips.
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:hidden">
              {t.refinements.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onAsk(r)}
                  className="tap-scale shrink-0 rounded-full bg-[#f2f2f2] px-3 py-1.5 text-xs font-medium transition hover:bg-[#e8e8e8]"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          {t.error && <p className="text-sm text-sale">{t.error}</p>}
          {t.done && t.answer && (
            <div className="flex flex-wrap items-center gap-1 text-xs text-ink-soft">
              {t.shareId && (
                <span className="mr-2">
                  <ShareButton id={t.shareId} q={t.user} />
                </span>
              )}
              {voted[i] === undefined ? (
                <>
                  <span className="mr-1">Ajudou?</span>
                  {[true, false].map((up) => (
                    <button
                      key={String(up)}
                      type="button"
                      aria-label={up ? "Sim" : "Não"}
                      onClick={() => { setVoted((v) => ({ ...v, [i]: up })); track("shop.feedback", { chat: chatId, model, turn: i + 1, up }); }}
                      className="tap-scale rounded-full px-2 py-1 transition hover:bg-line"
                    >
                      {up ? "👍" : "👎"}
                    </button>
                  ))}
                </>
              ) : (
                <span>Obrigado!</span>
              )}
            </div>
          )}
        </li>
      ))}
      <div ref={end} />
      {model && <li className="text-[11px] text-ink-soft/60">modelo: {model.split("/").pop()}</li>}
    </ol>
  );
}

function Results({
  turn,
  hidden,
  onOpen,
  onMore,
  votes,
  onVote,
  onBroken,
  favIds,
  onFav,
}: {
  turn: Turn;
  favIds: Set<string>;
  onFav: (t: Tile) => void;
  hidden: Set<string>;
  onOpen: (t: Tile) => void;
  onMore: (t: Tile) => void;
  votes: Record<string, boolean>;
  onVote: (t: Tile, up: boolean) => void;
  onBroken: (t: Tile) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setShowAll(false);
  }, [turn.user]);

  const { picked, rest } = useMemo(() => {
    const visible = turn.products.filter((p) => !hidden.has(p.id));
    if (!turn.curated) return { picked: visible, rest: [] as Tile[] };
    const byId = new Map(visible.map((p) => [p.id, p]));
    // What the shopper hearted (while the photos drifted, or before) leads the grid.
    const hearted = visible.filter((p) => favIds.has(p.id));
    const picked = [...hearted, ...turn.curated.map((id) => byId.get(id)).filter((p): p is Tile => !!p && !favIds.has(p.id))];
    const chosen = new Set(picked.map((p) => p.id));
    return { picked, rest: visible.filter((p) => !chosen.has(p.id)) };
  }, [turn.products, turn.curated, hidden, favIds]);

  // The last row is always full: top it up from "ver mais" to a multiple of the columns on screen.
  const cols = useGridCols();
  const pad = rest.length ? (cols - (picked.length % cols)) % cols : 0;
  const shown = showAll ? [...picked, ...rest] : [...picked, ...rest.slice(0, pad)];
  const moreCount = rest.length - pad;
  // The drifting photos play for at least MIN_DRIFT once the first ones arrive, even when the
  // answer is quick (or cached): it is the part people like watching. Reopened links skip it.
  const found = turn.products.filter((p) => p.images[0]);
  const [held, setHeld] = useState(false);
  const heldFor = useRef<string | null>(null);
  useEffect(() => {
    if (!turn.live || !found.length || heldFor.current === turn.key) return;
    heldFor.current = turn.key;
    setHeld(true);
    const t = setTimeout(() => setHeld(false), MIN_DRIFT);
    return () => clearTimeout(t);
  }, [turn.key, turn.live, found.length > 0]);
  // Until the model has picked, show progress, not the raw search results:
  // showing them and then swapping in the curated set reads as a glitch.
  const choosing = (!turn.done && !turn.curated) || (held && !turn.error);
  const rowCount = useDriftRows(found.length);

  if (turn.done && !shown.length) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">
        <p className="font-medium tracking-tight text-2xl text-ink">{turn.error ? "As lojas não responderam agora." : "Nada por aqui ainda."}</p>
        <p className="mt-2 text-sm">{turn.error ? "Não é falta de produto — tente de novo em instantes." : "Tente dizer de outro jeito — uma peça, uma marca, uma faixa de preço."}</p>
      </div>
    );
  }

  if (choosing) {
    // Nothing found yet: the steps above say what is happening; no wall of grey boxes.
    if (!found.length) return null;
    const brands = new Set(found.map((p) => p.brand)).size;
    // Rows drifting in alternating directions, each its own share of what has arrived so far.
    const rows = Array.from({ length: rowCount }, (_, r) => found.filter((_, i) => i % rowCount === r)).filter((r) => r.length);
    return (
      <div aria-busy="true" className="animate-rise">
        <p className="mb-4 text-sm text-ink-soft">
          <span className="font-medium text-ink tabular-nums">{found.length} peças</span> em {brands} {brands === 1 ? "marca" : "marcas"} até agora
          <span className="sm:hidden"> · toque para favoritar</span>
          <span className="hidden sm:inline"> · toque numa peça para favoritar, ela vem primeiro no resultado</span>
        </p>
        <div className="edge-fade -mx-4 flex flex-col gap-3 overflow-hidden lg:mx-0">
          {rows.map((row, r) => (
            <Drift key={r} tiles={row.slice(0, 16)} reverse={r % 2 === 1} favIds={favIds} onFav={onFav} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {shown.map((t, i) => (
              <ProductTile key={t.id} t={t} index={i} fav={favIds.has(t.id)} onFav={() => onFav(t)} onOpen={() => onOpen(t)} onMore={() => onMore(t)} vote={votes[t.id]} onVote={(up) => onVote(t, up)} onBroken={() => onBroken(t)} />
        ))}
      </div>
      {moreCount > 0 && !showAll && (
        <div className="mt-10 text-center">
          <button type="button" onClick={() => setShowAll(true)} className="tap-scale rounded-full border border-ink/15 px-5 py-2.5 text-sm transition hover:border-ink">
            Ver mais {moreCount} resultados
          </button>
        </div>
      )}
    </div>
  );
}

export const eager = true;
export const sync = true;

const CONTEXT_MAX = 280;
/** "Refinar ✨" shows from this many characters (the server refuses fewer); asking on its own, from a longer sentence. */
const REFINE_MIN = 20;
const AUTO_REFINE_MIN = 25;

/** "Adicionar meu contexto": saved per device, sent with every search (see myContext). */
function MyContext() {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setValue(myContext.get()), []);
  const save = (v: string) => {
    setValue(v);
    myContext.set(v);
    setSaved(true);
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 text-sm text-ink-soft underline decoration-ink/20 underline-offset-4 transition hover:text-ink"
      >
        {value ? "✓ Seu contexto está ativo · editar" : "+ Adicionar meu contexto"}
      </button>
    );
  }
  return (
    <div className="mt-5 w-full max-w-xl rounded-2xl border border-line bg-card p-4 text-left">
      <label htmlFor="my-context" className="text-sm font-medium">
        Meu contexto
      </label>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        O que você escrever aqui vai junto com cada busca, para ajudar na escolha. Ex.: “loira, 1,75 m, veste 40, não gosto de rosa,
        prefiro tecidos naturais”. Fica salvo só neste aparelho e não aparece nos links que você compartilha.
      </p>
      <textarea
        id="my-context"
        value={value}
        maxLength={CONTEXT_MAX}
        rows={3}
        onChange={(e) => {
          setSaved(false);
          setValue(e.target.value);
        }}
        onBlur={(e) => save(e.target.value)}
        placeholder="Ex.: loira, alta, não gosto de rosa…"
        className="mt-3 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink/40"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
        <span className="tabular-nums">
          {value.length}/{CONTEXT_MAX}
        </span>
        <span className="flex gap-3">
          {value && (
            <button type="button" onClick={() => save("")} className="underline underline-offset-2 hover:text-ink">
              Apagar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              save(value);
              setOpen(false);
            }}
            className="rounded-full bg-ink px-3.5 py-1.5 font-medium text-paper"
          >
            {saved ? "Salvo ✓" : "Salvar"}
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * The loading view's narration: every step the server reported, the current one live, the
 * earlier ones checked off and fading. Only the last four, so it never pushes the photos away.
 */
function Steps({ steps }: { steps: string[] }) {
  const last = steps.slice(-4);
  return (
    <ol className="flex flex-col gap-1.5 text-sm" aria-live="polite">
      {last.map((s, i) => {
        const current = i === last.length - 1;
        return (
          <li key={`${steps.length - last.length + i}:${s}`} className={`flex animate-rise items-start gap-2 ${current ? "text-ink" : "text-ink-soft/70"}`}>
            {current ? (
              <span className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-forest" />
            ) : (
              <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-forest/70" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3.5 8.5l3 3 6-7" /></svg>
            )}
            <span className="min-w-0">{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

const MIN_DRIFT = 3_000;

/**
 * How many drifting rows: 2 on phones, 3 on a desktop, 4 on a tall one, but never thinner than
 * ~7 photos a row (a row of three repeats itself on screen).
 */
function useDriftRows(found: number): number {
  const [max, setMax] = useState(2);
  useEffect(() => {
    const pick = () => setMax(matchMedia("(min-width: 1024px) and (min-height: 1000px)").matches ? 4 : matchMedia("(min-width: 1024px)").matches ? 3 : 2);
    pick();
    addEventListener("resize", pick);
    return () => removeEventListener("resize", pick);
  }, []);
  return Math.max(1, Math.min(max, Math.floor(found / 7)));
}

/** One row of found photos sliding sideways forever (the list is doubled so the loop has no seam). */
function Drift({ tiles, reverse, favIds, onFav }: { tiles: Tile[]; reverse?: boolean; favIds: Set<string>; onFav: (t: Tile) => void }) {
  const loop = [...tiles, ...tiles];
  return (
    <div
      // Pauses under the mouse, so a photo can be caught and hearted.
      className="flex w-max gap-3 hover:[animation-play-state:paused]"
      style={{ animation: `drift ${Math.max(20, tiles.length * 4)}s linear infinite${reverse ? " reverse" : ""}` }}
    >
      {loop.map((t, i) => {
        const on = favIds.has(t.id);
        return (
          <button
            type="button"
            key={`${t.id}:${i}`}
            onClick={() => onFav(t)}
            aria-pressed={on}
            aria-label={`${on ? "Remover dos favoritos" : "Favoritar"}: ${t.brand} ${t.title}`}
            tabIndex={i >= tiles.length ? -1 : undefined}
            className="relative w-32 shrink-0 text-left sm:w-40 lg:w-44 2xl:w-52"
          >
            <img
              src={thumb(t.images[0], 320)}
              alt=""
              loading="lazy"
              onError={(e) => (e.currentTarget.parentElement!.style.display = "none")}
              className={`aspect-[3/4] w-full rounded-sm bg-[#f4f4f4] object-cover transition ${on ? "ring-2 ring-sale ring-offset-2" : "hover:brightness-95"}`}
            />
            {on && (
              <span className="absolute right-2 top-2 grid size-7 animate-rise place-items-center rounded-full bg-white text-sale shadow">
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor"><path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3c.8-1.2 2.1-2.3 4.1-2.3 3.4 0 5.1 3.5 3.6 6.4C19 15.6 12 20 12 20z" /></svg>
              </span>
            )}
            <span className="mt-1.5 block truncate text-[11px] uppercase tracking-[0.06em] text-ink-soft">{t.brand}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Columns of the product grid at this width (matches grid-cols-2 sm:3 xl:4 2xl:5). */
function useGridCols(): number {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const pick = () => setCols(innerWidth >= 1536 ? 5 : innerWidth >= 1280 ? 4 : innerWidth >= 640 ? 3 : 2);
    pick();
    addEventListener("resize", pick);
    return () => removeEventListener("resize", pick);
  }, []);
  return cols;
}

/**
 * What Jev understood from the request, dimension by dimension, best guesses first. What it is
 * sure of comes pre-selected; what matters and is unknown is asked. Picks are multi-select.
 */
function RefineSheet({ text, dims, onSearch, onClose }: { text: string; dims: RefineDim[]; onSearch: (context: string[]) => void; onClose: () => void }) {
  const [sel, setSel] = useState<Record<string, string[]>>(() => Object.fromEntries(dims.map((d) => [d.key, d.picked])));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const toggle = (key: string, o: string) => setSel((s) => ({ ...s, [key]: s[key]?.includes(o) ? s[key].filter((x) => x !== o) : [...(s[key] ?? []), o] }));
  const asked = dims.filter((d) => d.ask);
  const known = dims.filter((d) => !d.ask && d.picked.length);
  const more = dims.filter((d) => !d.ask && !d.picked.length).sort((a, b) => b.relevance - a.relevance);
  const context = dims.filter((d) => sel[d.key]?.length).map((d) => `${d.name}: ${sel[d.key].join(", ")}`);
  const group = (title: string, list: RefineDim[]) =>
    list.length > 0 && (
      <section className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft">{title}</p>
        {list.map((d) => (
          <div key={d.key} className="mt-3">
            <p className="text-sm font-medium">{d.label}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {d.options.map((o) => {
                const on = sel[d.key]?.includes(o.label);
                return (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(d.key, o.label)}
                    className={`tap-scale rounded-full px-3 py-1.5 text-xs transition ${on ? "bg-ink text-white" : "bg-[#f2f2f2] text-ink hover:bg-[#e8e8e8]"}`}
                  >
                    {/* "Qual o seu papel?": the event is the same on every chip, show only the role */}
                    {d.label === "Qual o seu papel?" ? (o.label.split(" — ")[1] ?? o.label) : o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Refinar a busca"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-lg animate-rise flex-col rounded-t-3xl bg-paper shadow-2xl sm:rounded-3xl"
      >
        <div className="overflow-y-auto px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft">Refinar ✨</p>
              <p className="mt-1 text-lg font-medium leading-snug tracking-tight">“{text}”</p>
            </div>
            <button type="button" aria-label="Fechar" onClick={onClose} className="tap-scale -mr-1 rounded-full p-1.5 text-ink-soft hover:bg-line">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          {group(asked.length ? "Pra eu acertar" : "", asked)}
          {group("O que eu entendi", known)}
          {group("Quer detalhar?", more)}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-5 py-3">
          <button type="button" onClick={() => onSearch([])} className="text-sm text-ink-soft underline-offset-2 hover:underline">
            Buscar sem detalhes
          </button>
          <button type="button" onClick={() => onSearch(context)} className="tap-scale ml-auto rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white">
            Buscar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Refinar ✨" beside a finished result (desktop: the empty space under the composer). Same Jev
 * dimensions as the sheet, cached per words + department on the server, so the home's categories
 * come back instantly. Pick any number of chips, then "Refinar" searches again with them.
 */
function InlineRefine({
  text,
  dept,
  context,
  suggestions = [],
  onSuggest,
  onPick,
}: {
  /** Undefined for "Mais como este": no request to read, only the suggestions. */
  text?: string;
  dept: Dept;
  context?: string[];
  suggestions?: string[];
  onSuggest: (r: string) => void;
  onPick: (details: string[]) => void;
}) {
  const [dims, setDims] = useState<RefineDim[]>([]);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const toggle = (key: string, o: string) => setSel((s) => ({ ...s, [key]: s[key]?.includes(o) ? s[key].filter((x) => x !== o) : [...(s[key] ?? []), o] }));
  useEffect(() => {
    if (!text || !matchMedia("(min-width: 1024px)").matches) return; // phones: no room beside the grid
    let live = true;
    void fetchRefine(text, dept).then((r) => live && setDims(r?.dims ?? []));
    return () => {
      live = false;
    };
  }, [text, dept]);
  const answered = new Set((context ?? []).map((c) => c.split(":")[0].trim()));
  const show = dims
    .filter((d) => !answered.has(d.name) && d.options.length > 1)
    .sort((a, b) => Number(b.ask) - Number(a.ask) || b.relevance - a.relevance)
    .slice(0, 4);
  const picked = show.filter((d) => sel[d.key]?.length).map((d) => `${d.name}: ${sel[d.key].join(", ")}`);
  const n = show.reduce((k, d) => k + (sel[d.key]?.length ?? 0), 0);
  if (!show.length && !suggestions.length) return null;
  return (
    <section className="mt-8 hidden animate-rise lg:block">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft">Refinar ✨</p>
      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((r) => (
            <button key={r} type="button" onClick={() => onSuggest(r)} className="tap-scale rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium transition hover:border-ink">
              {r}
            </button>
          ))}
        </div>
      )}
      {show.map((d) => (
        <div key={d.key} className="mt-3">
          <p className="text-sm font-medium">{d.label}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {d.options.slice(0, 5).map((o) => {
              const on = !!sel[d.key]?.includes(o.label);
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(d.key, o.label)}
                  className={`tap-scale rounded-full px-3 py-1.5 text-xs transition ${on ? "bg-ink text-white" : "bg-[#f2f2f2] text-ink hover:bg-[#e8e8e8]"}`}
                >
                  {d.label === "Qual o seu papel?" ? (o.label.split(" — ")[1] ?? o.label) : o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {show.length > 0 && (
      <button
        type="button"
        disabled={!picked.length}
        onClick={() => onPick(picked)}
        className="tap-scale mt-5 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition disabled:cursor-default disabled:opacity-30"
      >
        Refinar{n ? ` (${n})` : ""}
      </button>
      )}
    </section>
  );
}
