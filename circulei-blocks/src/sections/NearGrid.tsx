import { useState } from "react";
import { Card, Hb, Kick } from "~/components/ui";
import type { CardData, Place } from "~/types";

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @hide */
  place?: Place;
  /** @hide */
  sizes?: string[];
  /** @hide */
  cards?: CardData[];
  /** @hide */
  selected?: { sizes: string[]; heights: string[] };
}

const HEIGHTS: [string, string][] = [["a", "até 1,59"], ["b", "1,60–1,64"], ["c", "1,65–1,69"], ["d", "1,70+"]];

/** The pieces in the city on screen, with size and height filters. */
export default function NearGrid({ kicker = "Perto de você", place, sizes = [], cards = [], selected }: Props) {
  const hub = place?.hub ?? null;
  const [sz, setSz] = useState<string[]>(selected?.sizes ?? []);
  const [hs, setHs] = useState<string[]>(selected?.heights ?? []);
  // Kept in the URL, so a piece's page and back (or a shared link) keep the same list.
  const toggle = (list: string[], set: (v: string[]) => void, v: string, key: string) => {
    const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
    set(next);
    const u = new URL(location.href);
    if (next.length) u.searchParams.set(key, next.join(","));
    else u.searchParams.delete(key);
    history.replaceState(history.state, "", u);
  };
  const shown = cards.filter((c) => (!sz.length || sz.some((s) => c.sizes.split(",").includes(s))) && (!hs.length || hs.includes(c.h)));
  return (
    <section className="near wrap" id="perto">
      <div className="sec-head">
        <Kick>{kicker}</Kick>
        <Hb dim={!hub ? "Escolha uma cidade pra ver o que está perto." : place?.here ? "Pra provar e receber aqui perto." : `Motoboy dentro de ${hub.city}. Pra você, enviamos.`}>
          {hub ? `Nos closets de ${hub.city}.` : "Nos closets do Brasil."}
        </Hb>
      </div>
      <div className="filters" role="group" aria-label="Filtrar">
        <span className="fl">Tamanho</span>
        {sizes.map((s) => (
          <button key={s} type="button" aria-pressed={sz.includes(s)} onClick={() => toggle(sz, setSz, s, "tam")}>
            {s}
          </button>
        ))}
        <span className="fl">Sua altura</span>
        {HEIGHTS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={hs.includes(v)} onClick={() => toggle(hs, setHs, v, "alt")}>
            {l}
          </button>
        ))}
        <output className="count" aria-live="polite">
          {shown.length} {shown.length === 1 ? "peça" : "peças"}
        </output>
      </div>
      <div className="grid" id="grid">
        {shown.map((c, i) => (
          <Card key={c.handle} c={c} i={i} />
        ))}
      </div>
      {shown.length ? null : (
        <p className="empty">
          Nenhuma peça com esse filtro aqui. <a href="/?cidade=brasil#perto">Ver o Brasil todo</a>: tudo chega por envio.
        </p>
      )}
    </section>
  );
}
