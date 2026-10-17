import { useEffect, useMemo, useRef, useState } from "react";
import type { Tile } from "~/types";
import { ProductDrawer, ProductTile, TileSkeleton, outbound, thumb } from "~/components/Product";
import { ShareButton, SiteHeader } from "~/components/Share";
import { bus, useBus } from "~/sdk/bus";
import { myContext, track, useShopChat, type Dept, type Turn } from "~/sdk/useShopChat";

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

export default function ShopChat({
  headline = "Todas as marcas brasileiras que você ama. Um chat.",
  subheadline = "Diga o que procura e eu busco nos catálogos de FARM, Animale, Osklen, Reserva, FILA, New Balance e mais.",
  placeholder = "O que você está procurando?",
  suggestions = [],
  disclaimer = "Preços de catálogo. Estoque, frete e preço final são confirmados na loja.",
}: Props) {
  const { turns, model, chatId, send, similarTo, restore, reset } = useShopChat();
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
  const [view, setView] = useState(-1);
  const started = view >= 0 && turns.length > 0;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const pushTurn = (turn: number, q: string) => {
    const p = new URLSearchParams(location.search);
    p.set("q", q);
    p.set("dept", dept);
    p.delete("s"); // the new turn gets its own snapshot id when it finishes
    // Asked from inside the drawer: take over its history entry, so Back skips the closed drawer.
    if (history.state?.layer) history.replaceState({ turn }, "", `?${p}`);
    else history.pushState({ turn }, "", `?${p}`);
    setView(turn);
  };

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (e.state?.layer) return; // an overlay's own entry (drawer, gallery): it handles itself
      const p = new URLSearchParams(location.search);
      const q = p.get("q");
      const turn: number = typeof e.state?.turn === "number" ? e.state.turn : q ? 0 : -1;
      if (turn >= 0 && turn >= turnsRef.current.length && q) {
        // Forward into a turn we no longer hold (the chat was reset): reopen its snapshot, or ask again.
        const at = turnsRef.current.length;
        setView(at);
        const snap = p.get("s");
        if (snap) void restore(snap, at).then((ok) => { if (!ok) send(q, at, (p.get("dept") as Dept) || dept, store); });
        else send(q, at, (p.get("dept") as Dept) || dept, store);
        return;
      }
      setOpen(null);
      setView(turn);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  });

  // When the turn on screen is frozen, its URL becomes the snapshot (?s=id): copying the address bar
  // shares exactly these picks, like the Share button, instead of re-running the search.
  const onScreen = view >= 0 ? turns[view] : undefined;
  useEffect(() => {
    const id = onScreen?.shareId;
    if (!id) return;
    const p = new URLSearchParams(location.search);
    if (p.get("s") === id) return;
    p.set("s", id);
    history.replaceState(history.state, "", `?${p}`);
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
    const snap = p.get("s");
    if (q || snap) {
      history.replaceState({ turn: 0 }, "");
      setView(0);
      // ?s= is what someone saw and copied: show exactly that. Only a bare ?q= runs a new search.
      if (snap) void restore(snap, 0).then((ok) => { if (!ok && q) send(q, 0, (d as Dept) || "feminino", s); });
      else if (q) send(q, 0, (d as Dept) || "feminino", s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asking from turn `view` keeps turns 0..view and drops what came after it
  // (from the home, view = -1: a fresh conversation), exactly like browser history.
  const ask = (text: string) => {
    setOpen(null);
    const keep = view + 1;
    pushTurn(keep, text);
    send(text, keep, dept, store);
  };
  const more = (t: Tile) => {
    setOpen(null);
    const keep = view + 1;
    pushTurn(keep, `Mais opções parecidas com "${t.title}" da ${t.brand}.`);
    similarTo(t, keep, dept);
  };
  const dismiss = (t: Tile) => {
    setHidden((h) => new Set(h).add(t.id));
    track("shop.dismiss", { chat: chatId(), model, id: t.id });
  };

  // Cards in other sections (Showcase) ask through the bus; always run the latest `ask`.
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => bus.onAsk((t) => askRef.current(t)), []);
  useEffect(() => {
    bus.set({ started });
  }, [started]);

  const chips = suggestions.filter((s) => !s.dept || s.dept === dept);

  return (
    <section className={`overflow-x-clip ${started ? "min-h-dvh" : ""}`}>
      <SiteHeader
        onHome={() => {
          // The logo starts a new conversation; earlier entries re-ask if revisited.
          reset();
          history.pushState({ turn: -1 }, "", location.pathname);
          setView(-1);
        }}
        right={started ? <DeptToggle value={dept} onChange={setDept} /> : undefined}
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
            <Composer placeholder={placeholder} onSend={ask} autoFocus large />
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
        <div className="mx-auto grid max-w-[1600px] gap-6 px-4 pb-28 pt-5 md:px-8 lg:grid-cols-[340px_1fr] lg:gap-10">
          <aside className="lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <Thread turns={turns.slice(0, view + 1)} model={model} chatId={chatId()} onAsk={(r) => { track("shop.refine", { chat: chatId(), model, text: r }); ask(r); }} />
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 frost p-3 lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0">
              <Composer placeholder="Refine: mais barato, outra cor, só tênis…" onSend={ask} />
            </div>
          </aside>
          <Results turn={turns[Math.min(view, turns.length - 1)]} hidden={hidden} onOpen={(t) => { setOpen(t); track("shop.open", { chat: chatId(), model, id: t.id }); }} onMore={more} onDismiss={dismiss} />
        </div>
      )}

      {open && (
        <ProductDrawer
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
    <div role="radiogroup" aria-label="Departamento" className="flex rounded-full border border-line bg-card p-0.5 text-sm">
      {(["feminino", "masculino"] as const).map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={`rounded-full px-3.5 py-1.5 capitalize transition ${value === d ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

function Composer({ placeholder, onSend, autoFocus, large }: { placeholder: string; onSend: (t: string) => void; autoFocus?: boolean; large?: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className={`flex items-end gap-2 rounded-[28px] border border-line bg-card shadow-[0_8px_30px_-14px_rgba(0,0,0,0.25)] transition focus-within:border-ink/40 ${large ? "p-2.5 pl-6" : "p-1.5 pl-4"}`}
    >
      <textarea
        ref={ref}
        value={text}
        rows={1}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`max-h-40 min-w-0 flex-1 resize-none bg-transparent outline-none placeholder:text-ink-soft/70 field-sizing-content ${large ? "py-3 text-lg" : "py-2.5 text-sm"}`}
      />
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label="Enviar"
        className={`grid shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-ink disabled:opacity-30 ${large ? "size-12" : "size-10"}`}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
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
          <p className="self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">{t.user}</p>
          {t.status && !t.answer && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <span className="size-2 animate-pulse rounded-full bg-forest" />
              {t.status}
            </p>
          )}
          {t.answer && <p className="text-[15px] font-medium leading-snug tracking-tight lg:text-lg">{t.answer}</p>}
          {t.done && !!t.refinements?.length && (
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
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
  onDismiss,
}: {
  turn: Turn;
  hidden: Set<string>;
  onOpen: (t: Tile) => void;
  onMore: (t: Tile) => void;
  onDismiss: (t: Tile) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setShowAll(false);
  }, [turn.user]);

  const { picked, rest } = useMemo(() => {
    const visible = turn.products.filter((p) => !hidden.has(p.id));
    if (!turn.curated) return { picked: visible, rest: [] as Tile[] };
    const byId = new Map(visible.map((p) => [p.id, p]));
    const picked = turn.curated.map((id) => byId.get(id)).filter((p): p is Tile => !!p);
    const chosen = new Set(picked.map((p) => p.id));
    return { picked, rest: visible.filter((p) => !chosen.has(p.id)) };
  }, [turn.products, turn.curated, hidden]);

  const shown = showAll ? [...picked, ...rest] : picked;
  // Until the model has picked, show progress, not the raw search results:
  // showing them and then swapping in the curated set reads as a glitch.
  const choosing = !turn.done && !turn.curated;

  if (turn.done && !shown.length) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">
        <p className="font-medium tracking-tight text-2xl text-ink">{turn.error ? "As lojas não responderam agora." : "Nada por aqui ainda."}</p>
        <p className="mt-2 text-sm">{turn.error ? "Não é falta de produto — tente de novo em instantes." : "Tente dizer de outro jeito — uma peça, uma marca, uma faixa de preço."}</p>
      </div>
    );
  }

  if (choosing) {
    const found = turn.products.filter((p) => p.images[0]);
    const brands = new Set(found.map((p) => p.brand)).size;
    return (
      <div aria-busy="true">
        {found.length > 0 && (
          <div className="mb-6 flex items-center gap-4">
            <div className="flex -space-x-3">
              {found.slice(0, 7).map((t, i) => (
                <img
                  key={t.id}
                  src={thumb(t.images[0], 120)}
                  alt=""
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  className="h-14 w-10 animate-rise rounded-xs object-cover opacity-80 ring-2 ring-white"
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
            <p className="text-sm text-ink-soft">
              <span className="font-medium text-ink tabular-nums">{found.length} peças</span> em {brands} {brands === 1 ? "marca" : "marcas"} · escolhendo as melhores…
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {shown.map((t, i) => (
              <ProductTile key={t.id} t={t} index={i} onOpen={() => onOpen(t)} onMore={() => onMore(t)} onDismiss={() => onDismiss(t)} />
        ))}
      </div>
      {rest.length > 0 && !showAll && (
        <div className="mt-10 text-center">
          <button type="button" onClick={() => setShowAll(true)} className="tap-scale rounded-full border border-ink/15 px-5 py-2.5 text-sm transition hover:border-ink">
            Ver mais {rest.length} resultados
          </button>
        </div>
      )}
    </div>
  );
}

export const eager = true;
export const sync = true;

const CONTEXT_MAX = 280;

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
