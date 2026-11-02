import { useEffect, useRef, useState } from "react";
import { Arrow, Card, Kick, Pin, brl, img } from "~/components/ui";
import type { CardData, Place } from "~/types";

export interface Props {
  /** @title Título */
  headline?: string;
  /** @title Rótulo da busca */
  stylistLabel?: string;
  /**
   * @title Ocasiões
   * @description A primeira vira o exemplo da busca; as outras, botões.
   */
  occasions?: string[];
  /** @hide */
  place?: Place;
  /** @hide */
  count?: number;
  /** @hide */
  fromRent?: number;
  /** @hide */
  picks?: { handle: string; title: string; brand: string; img: string; price4: number }[];
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
  occasions = ["casamento na praia, não curto decote"],
  place,
  count = 0,
  fromRent = 0,
  picks = [],
}: Props) {
  const hub = place?.hub ?? null;
  const where = hub ? hub.city : "todo o Brasil";
  const [q, setQ] = useState("");
  const [ph, setPh] = useState(0);
  const [asked, setAsked] = useState<string | null>(null);
  const [res, setRes] = useState<Result | "loading" | "error" | "busy" | null>(null);
  const [note, setNote] = useState<string | null | undefined>(undefined);
  const seq = useRef(0);
  const box = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (asked) return;
    const t = setInterval(() => setPh((k) => (k + 1) % occasions.length), 3200);
    return () => clearInterval(t);
  }, [asked, occasions.length]);

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
      <section className="hero">
        <div className="hero-copy">
          <Kick>{hub ? `Closets de ${hub.city}` : "Closets do Brasil todo"}</Kick>
          <h1 className="hw">{headline}</h1>
          <p className="lede">
            <b>
              {count} peças nos closets de {where},
            </b>{" "}
            {hub ? "com entrega por motoboy na mesma cidade." : "enviadas pra você."}
          </p>
          <div className="stylist">
            <label htmlFor="q">
              <span>{stylistLabel}</span>
              <em className="new">Novo</em>
            </label>
            <form
              className="ask"
              action="/"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                run(q);
              }}
            >
              <input
                ref={input}
                id="q"
                name="q"
                autoComplete="off"
                enterKeyHint="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Conte a ocasião: ${occasions[ph] ?? ""}`}
              />
              <button aria-label="Buscar">
                <Arrow />
              </button>
            </form>
            <div className="chips" aria-label="Ocasiões">
              {occasions.slice(1, 6).map((o) => (
                <button key={o} type="button" onClick={() => run(o)}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className="hero-foot">
            <span>
              <Pin />
              {hub ? `${hub.city}, ${hub.uf}` : "Brasil"}
            </span>
            <span>Vestidos a partir de {brl(fromRent)}</span>
          </div>
        </div>
        <div className="hero-art" aria-label={`Peças em ${where}`}>
          {picks.map((p, i) => (
            <a key={p.handle} href={`/p/${p.handle}`} className={`f f${i}`}>
              <img src={img(p.img, i === 0 ? 900 : 600)} alt={p.title} fetchPriority={i === 0 ? "high" : "auto"} decoding="async" />
              <span>
                {p.brand} · {brl(p.price4)}
              </span>
            </a>
          ))}
        </div>
      </section>

      <section id="busca" className="results" hidden={!asked} aria-live="polite" ref={box}>
        {asked ? (
          <>
            <Kick>Personal stylist</Kick>
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
