import { useEffect, useMemo, useRef, useState } from "react";
import type { Tile } from "~/types";
import { ProductDrawer, ProductTile, TileSkeleton, outbound } from "~/components/Product";
import { track, useShopChat, type Dept, type Turn } from "~/sdk/useShopChat";

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
  const { turns, model, chatId, send, reset } = useShopChat();
  const [dept, setDept] = useState<Dept>("feminino");
  const [open, setOpen] = useState<Tile | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const started = turns.length > 0;

  // ?q= makes a search shareable and lets the home page deep-link a prompt.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return; // effects run twice in dev; a deep link must send once
    booted.current = true;
    const p = new URLSearchParams(location.search);
    const d = p.get("dept");
    if (d === "masculino" || d === "feminino") setDept(d);
    const q = p.get("q");
    if (q) send(q, (d as Dept) || "feminino");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = (text: string) => {
    if (!started) {
      const p = new URLSearchParams(location.search);
      p.set("q", text);
      p.set("dept", dept);
      history.replaceState(null, "", `?${p}`);
    }
    setOpen(null);
    send(text, dept);
  };
  const more = (t: Tile) => ask(`Mais opções parecidas com "${t.title}" da ${t.brand}.`);
  const dismiss = (t: Tile) => {
    setHidden((h) => new Set(h).add(t.id));
    track("shop.dismiss", { chat: chatId(), model, id: t.id });
  };

  const chips = suggestions.filter((s) => !s.dept || s.dept === dept);

  return (
    <section className="min-h-dvh">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line/70 frost px-4 py-3 md:px-8">
        <button type="button" onClick={() => { reset(); history.replaceState(null, "", location.pathname); }} className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tracking-tight leading-none">deco shop</span>
          <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-forest">beta</span>
        </button>
        <DeptToggle value={dept} onChange={setDept} />
      </header>

      {!started ? (
        <div className="mx-auto flex max-w-3xl flex-col items-center px-5 pb-16 pt-[12vh] text-center md:pt-[16vh]">
          <h1 className="animate-rise font-medium tracking-tight text-[2.4rem] leading-[1.02] tracking-[-0.03em] text-balance md:text-7xl">{headline}</h1>
          <p className="mt-5 max-w-xl animate-rise text-base text-ink-soft text-pretty md:text-lg" style={{ animationDelay: "80ms" }}>
            {subheadline}
          </p>
          <div className="mt-9 w-full animate-rise" style={{ animationDelay: "160ms" }}>
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
          <p className="mt-6 text-xs text-ink-soft/80">{disclaimer}</p>
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1600px] gap-6 px-4 pb-28 pt-5 md:px-8 lg:grid-cols-[340px_1fr] lg:gap-10">
          <aside className="lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <Thread turns={turns} model={model} chatId={chatId()} />
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 frost p-3 lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0">
              <Composer placeholder="Refine: mais barato, outra cor, só tênis…" onSend={ask} />
            </div>
          </aside>
          <Results turn={turns[turns.length - 1]} hidden={hidden} onOpen={(t) => { setOpen(t); track("shop.open", { chat: chatId(), model, id: t.id }); }} onMore={more} onDismiss={dismiss} />
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

function Thread({ turns, model, chatId }: { turns: Turn[]; model?: string; chatId: string }) {
  const [voted, setVoted] = useState<Record<number, boolean>>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  return (
    <ol className="flex flex-col gap-5" aria-live="polite">
      {turns.map((t, i) => (
        <li key={i} className="flex flex-col gap-2.5">
          <p className="self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">{t.user}</p>
          {t.status && !t.answer && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <span className="size-2 animate-pulse rounded-full bg-forest" />
              {t.status}
            </p>
          )}
          {t.answer && <p className="font-medium tracking-tight text-xl leading-snug">{t.answer}</p>}
          {t.error && <p className="text-sm text-sale">{t.error}</p>}
          {t.done && t.answer && (
            <div className="flex items-center gap-1 text-xs text-ink-soft">
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
  const loading = !turn.done && shown.length === 0;

  if (turn.done && !shown.length) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-line p-12 text-center text-ink-soft">
        <p className="font-medium tracking-tight text-2xl text-ink">Nada por aqui ainda.</p>
        <p className="mt-2 text-sm">Tente dizer de outro jeito — uma peça, uma marca, uma faixa de preço.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {loading
          ? Array.from({ length: 10 }, (_, i) => <TileSkeleton key={i} />)
          : shown.map((t, i) => (
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
