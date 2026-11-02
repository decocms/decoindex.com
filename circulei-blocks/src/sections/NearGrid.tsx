import { useState } from "react";
import { Card } from "~/components/ui";
import { useQuietHistory } from "~/components/quietHistory";
import type { CardData, Place } from "~/types";

export interface Props {
  /** @title Peças por vez */
  pageSize?: number;
  /** @hide */
  place?: Place;
  /** @hide */
  sizes?: string[];
  /** @hide */
  cards?: CardData[];
  /** @hide */
  selected?: { sizes: string[]; heights: string[] };
  /** @hide */
  shown?: number;
}

const HEIGHTS: [string, string][] = [["a", "até 1,59"], ["b", "1,60–1,64"], ["c", "1,65–1,69"], ["d", "1,70+"]];

/** The pieces in the city on screen: big photos, a few at a time, size and height filters kept in the URL. */
export default function NearGrid({ pageSize = 12, place, sizes = [], cards = [], selected, shown: shown0 }: Props) {
  const hub = place?.hub ?? null;
  const [sz, setSz] = useState<string[]>(selected?.sizes ?? []);
  const [hs, setHs] = useState<string[]>(selected?.heights ?? []);
  const [limit, setLimit] = useState(Math.max(pageSize, shown0 ?? 0));
  const quiet = useQuietHistory();
  const setUrl = (key: string, v: string | null) => {
    const u = new URL(location.href);
    if (v) u.searchParams.set(key, v);
    else u.searchParams.delete(key);
    quiet(() => history.replaceState(history.state, "", u));
  };
  // Kept in the URL, so a piece's page and back (or a shared link) keep the same list.
  const toggle = (list: string[], set: (v: string[]) => void, v: string, key: string) => {
    const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
    set(next);
    setLimit(pageSize);
    setUrl(key, next.length ? next.join(",") : null);
    setUrl("mais", null);
  };
  const match = cards.filter((c) => (!sz.length || sz.some((s) => c.sizes.split(",").includes(s))) && (!hs.length || hs.includes(c.h)));
  const visible = match.slice(0, limit);
  return (
    <section className="near wrap" id="perto">
      {/* One row: what this is, the filters, how many. Kept short so the photos start high. */}
      <div className="filters" role="group" aria-label="Filtrar">
        <h2>{hub ? `Nos closets de ${hub.city}` : "Nos closets do Brasil"}</h2>
        <span className="fl">Tamanho</span>
        {sizes.map((s) => (
          <button key={s} type="button" aria-pressed={sz.includes(s)} onClick={() => toggle(sz, setSz, s, "tam")}>
            {s}
          </button>
        ))}
        <span className="fl">Altura</span>
        {HEIGHTS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={hs.includes(v)} onClick={() => toggle(hs, setHs, v, "alt")}>
            {l}
          </button>
        ))}
        <span className="count" aria-live="polite">
          {match.length} {match.length === 1 ? "peça" : "peças"}
        </span>
      </div>
      <div className="grid" id="grid">
        {visible.map((c, i) => (
          <Card key={c.handle} c={c} i={i} list={hub ? `Peças em ${hub.city}` : "Peças do Brasil"} />
        ))}
      </div>
      {match.length > limit ? (
        <p className="more-wrap">
          <button
            type="button"
            className="btn line"
            onClick={() => {
              const next = limit + pageSize;
              setLimit(next);
              setUrl("mais", String(next));
            }}
          >
            Ver mais peças
          </button>
        </p>
      ) : null}
      {match.length ? null : (
        <p className="empty">
          Nenhuma peça com esse filtro aqui. <a href="/?cidade=brasil#perto">Ver o Brasil todo</a>: tudo chega por envio.
        </p>
      )}
    </section>
  );
}
