import { useEffect, useRef, useState } from "react";
import { Arrow, Card, brl, img, srcset } from "~/components/ui";
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
  const [res, setRes] = useState<Result | "loading" | "error" | "busy" | null>(null);
  const [note, setNote] = useState<string | null | undefined>(undefined);
  const seq = useRef(0);
  const box = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);

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
    history.replaceState(history.state, "", u);
    requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    const qs = `q=${encodeURIComponent(ask)}&cidade=${hub?.slug ?? "brasil"}`;
    try {
      const r = await fetch(`/api/busca?${qs}&format=json`);
      if (my !== seq.current) return;
      if (r.status === 429) return setRes("busy");
      const data = (await r.json()) as Result;
      setRes(data);
      if (data.fallback || !data.picks.length) return setNote(null);
      const n = await fetch(`/api/nota?${qs}`).then((x) => (x.ok ? x.text() : "")).catch(() => "");
      if (my === seq.current) setNote(n || null);
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
    history.replaceState(history.state, "", u);
  };

  return (
    <>
      {/* One photo and a few words: the pieces are the hero. The stylist is offered, not shouted. */}
      <section className="feature">
        {feature ? (
          <a className="feature-img" href={`/p/${feature.handle}`}>
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

      <section id="busca" className="results" hidden={!asked} aria-live="polite" ref={box}>
        {asked ? (
          <>
            <h2 className="hb">
              {asked}
              {typeof res === "object" && res ? (
                <span className="dim">
                  {res.picks.length ? `${res.picks.length} peças${hub && res.near ? `, ${res.near} em ${hub.city}` : ""}.` : "Nada combinou de verdade."}
                </span>
              ) : null}
            </h2>
            {res === "loading" ? (
              <>
                <p className="thinking">Procurando nos closets…</p>
                <div className="skel">
                  {Array.from({ length: 8 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
              </>
            ) : res === "busy" || res === "error" ? (
              <p className="thinking">{res === "busy" ? "Muitas buscas seguidas. Tenta de novo em um minuto?" : "Não consegui buscar agora. Tenta de novo?"}</p>
            ) : res ? (
              <>
                <p className="meta-line">
                  {res.fallback ? "Busca simples, a stylist está fora do ar · " : ""}
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
                {note !== null && res.picks.length && !res.fallback ? (
                  <div className="note">
                    <span className="by">Nina · stylist da Circulei</span>
                    <span className="tx">{note ?? ""}</span>
                  </div>
                ) : null}
                <div className="grid">
                  {res.picks.map((c, i) => (
                    <Card key={c.handle} c={c} i={i} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}
