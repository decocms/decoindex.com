import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Arrow, CARD_SIZES, Card, brl, img, srcset } from "~/components/ui";
import { openPiece } from "~/components/PieceDrawer";
import { useQuietHistory } from "~/components/quietHistory";
import type { CardData, Place } from "~/types";

export interface Props {
  /** @title Título */
  headline?: string;
  /** @title Rótulo da busca */
  stylistLabel?: string;
  /**
   * @title Peças em destaque no topo
   * @description Identificadores (handles) das peças. Aparece a primeira que estiver na cidade da visitante.
   */
  featured?: string[];
  /** @hide */
  feature?: { handle: string; title: string; brand: string; img: string; price4: number } | null;
  /** @hide */
  place?: Place;
  /** @hide */
  count?: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The first row's photos, fetched at the size the grid will ask for, so they land with the grid (capped). */
const preload = (picks: CardData[]) =>
  Promise.race([
    Promise.all(
      picks.slice(0, 4).map((c) => {
        const im = new Image();
        im.sizes = CARD_SIZES;
        im.srcset = srcset(c.img);
        im.src = img(c.img, 540);
        return im.decode().catch(() => {});
      }),
    ),
    wait(1200),
  ]);

interface Result {
  picks: CardData[];
  near: number;
  fallback: boolean;
  hub: string | null;
}

export default function Hero({
  headline = "Alugue roupas incríveis perto de você",
  stylistLabel = "Personal stylist",
  place,
  count = 0,
  feature = null,
}: Props) {
  const hub = place?.hub ?? null;
  const where = hub ? hub.city : "todo o Brasil";
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [res, setRes] = useState<Result | "loading" | "writing" | "error" | "busy" | null>(null);
  const [note, setNote] = useState<string | null | undefined>(undefined);
  const seq = useRef(0);
  const box = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const quiet = useQuietHistory();

  const run = async (text: string) => {
    const ask = text.trim();
    if (!ask) return;
    const my = ++seq.current;
    setQ(ask);
    setAsked(ask);
    setRes("loading");
    setNote(undefined);
    const u = new URL(location.href);
    u.searchParams.set("q", ask);
    quiet(() => history.replaceState(history.state, "", u));
    requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    const qs = `q=${encodeURIComponent(ask)}&cidade=${hub?.slug ?? "brasil"}`;
    try {
      const r = await fetch(`/api/busca?${qs}&format=json`);
      if (my !== seq.current) return;
      if (r.status === 429) return setRes("busy");
      const data = (await r.json()) as Result;
      if (data.fallback || !data.picks.length) {
        await preload(data.picks);
        if (my !== seq.current) return;
        setNote(null);
        return setRes(data);
      }
      setRes("writing");
      // The grid waits (a little) for the note, so it lands once, already in the order the note
      // names its pieces: no second reshuffle under the visitor's eyes.
      const nota = fetch(`/api/nota?${qs}&format=json`)
        .then((x) => (x.status === 200 ? x.json() : null))
        .catch(() => null) as Promise<{ text: string; cited: string[] } | null>;
      const n = await Promise.race([nota, wait(4500).then(() => "late" as const)]);
      const cited = n && n !== "late" ? n.cited : [];
      const rank = (h: string) => (cited.includes(h) ? cited.indexOf(h) : cited.length);
      const picks = [...data.picks].sort((a, b) => rank(a.handle) - rank(b.handle));
      await preload(picks);
      if (my !== seq.current) return;
      setRes({ ...data, picks });
      if (n !== "late") setNote(n?.text || null);
      // Too slow: the grid shows as ranked and the words follow when they come, without reordering.
      else nota.then((x) => my === seq.current && setNote(x?.text || null));
    } catch {
      if (my === seq.current) setRes("error");
    }
  };

  useEffect(() => {
    const q0 = new URL(location.href).searchParams.get("q");
    if (q0) run(q0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setAsked(null);
    setRes(null);
    const u = new URL(location.href);
    u.searchParams.delete("q");
    quiet(() => history.replaceState(history.state, "", u));
  };

  const pending = res === "loading" || res === "writing";

  // The note box eases to its new height when the words change, so the grid under it glides instead of jumping.
  const noteBox = useRef<HTMLDivElement>(null);
  const noteH = useRef(0);
  useLayoutEffect(() => {
    const el = noteBox.current;
    if (!el) return void (noteH.current = 0);
    const h = el.offsetHeight;
    if (noteH.current && noteH.current !== h && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      el.animate([{ height: `${noteH.current}px` }, { height: `${h}px` }], { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" });
    noteH.current = h;
  });
  const waiting = pending || note === undefined;
  // What the note box says when it isn't the note itself (null = the note).
  const say =
    res === "loading"
      ? "Procurando nos closets…"
      : waiting
        ? "Escolhendo as peças pra você…"
        : note
          ? null
          : typeof res === "object" && res && !res.picks.length
            ? "Nada combinou de verdade. Conta de outro jeito?"
            : typeof res === "object" && res?.fallback
              ? "A stylist está fora do ar agora. Estas são as peças que mais combinam com as palavras do pedido."
              : "Estas são as peças que mais combinam com o pedido.";

  return (
    <>
      {/* One photo and a few words: the pieces are the hero. The stylist is offered, not shouted. */}
      <section className="feature">
        {feature ? (
          <a
            className="feature-img"
            href={`/p/${feature.handle}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              const c = { ...feature, sizes: "", size: "", h: "", tag: null };
              if (openPiece(c, hub ? `Peças em ${hub.city}` : "Favoritos")) e.preventDefault();
            }}
          >
            <img src={img(feature.img, 1100)} srcSet={srcset(feature.img)} sizes="(min-width: 900px) 46vw, 100vw" alt={`${feature.title}, ${feature.brand}`} fetchPriority="high" decoding="async" />
          </a>
        ) : null}
        <div className="feature-copy">
          <h1 className="hw">{headline}</h1>
          <p className="lede">
            {count} peças nos closets de {where}
            {hub ? ", com entrega por motoboy na mesma cidade." : ", enviadas pra você."}
          </p>
          <a className="btn dark" href="#perto">
            Ver as peças
          </a>
          {feature ? (
            <p className="feature-cap">
              Na foto: {feature.title}, {feature.brand} · {brl(feature.price4)} / 4 dias
            </p>
          ) : null}
          <form
            className="ask"
            action="/"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              // Close the phone keyboard first: the page resizing under a smooth scroll is what jumped.
              input.current?.blur();
              run(q);
            }}
          >
            <label htmlFor="q">{stylistLabel}</label>
            <span>
              <input ref={input} id="q" name="q" autoComplete="off" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Conte a ocasião e separamos as peças" />
              <button aria-label="Buscar">
                <Arrow />
              </button>
            </span>
          </form>
        </div>
      </section>

      {/* One frame from submit to answer: heading, a line of status, the note box and a row of
          blank tiles hold their places; the answer fills them instead of replacing them. */}
      <section id="busca" className="results" hidden={!asked} aria-live="polite" aria-busy={pending} ref={box}>
        {asked ? (
          <>
            <h2 className="hb">{asked}</h2>
            <p className="meta-line">
              <button
                className="again"
                type="button"
                onClick={() => {
                  scrollTo({ top: 0, behavior: "smooth" });
                  input.current?.select();
                  input.current?.focus({ preventScroll: true });
                }}
              >
                Nova busca
              </button>{" "}
              ·{" "}
              <button className="close" type="button" onClick={close}>
                Fechar
              </button>
            </p>
            {res === "busy" || res === "error" ? (
              <p className="note">
                <span className="tx">{res === "busy" ? "Muitas buscas seguidas. Tenta de novo em um minuto?" : "Não consegui buscar agora. Tenta de novo?"}</span>
              </p>
            ) : (
              <div className={`note${waiting ? " wait" : ""}`} ref={noteBox}>
                <span className="by">
                  Nina · {typeof res === "object" && res?.picks.length ? `${res.picks.length} peças${hub && res.near ? `, ${res.near} em ${hub.city}` : ""}` : "stylist da Circulei"}
                </span>
                <span className="tx" key={say ?? "nota"}>
                  {say ?? note}
                </span>
              </div>
            )}
            {pending ? (
              <div className="grid skel" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} style={{ ["--i" as string]: i }}>
                    <i />
                    <b />
                    <b />
                  </div>
                ))}
              </div>
            ) : typeof res === "object" && res?.picks.length ? (
              <div className="grid" key={asked}>
                {res.picks.map((c, i) => (
                  <Card key={c.handle} c={c} i={i} list={asked} />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}
