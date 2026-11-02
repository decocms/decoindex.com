import { Hb, Kick } from "~/components/ui";
import type { HubLink } from "~/types";

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @title Título */
  title?: string;
  /** @hide */
  hubs?: HubLink[];
  /** @hide */
  cities?: number;
  /** @hide */
  total?: number;
}

/** One card per city with its own page, nearest first. */
export default function ExploreCities({ kicker = "Rede nacional de closets", title = "Explore outras cidades.", hubs = [], cities = 0, total = 0 }: Props) {
  return (
    <section className="explore" aria-labelledby="explore-h">
      <div className="wrap">
        <Kick>{kicker}</Kick>
        <Hb id="explore-h" dim={`${cities} cidades, ${total} peças.`}>
          {title}
        </Hb>
      </div>
      <div className="rail cities-rail">
        {hubs.map((h) => (
          <a key={h.slug} className="cc" href={`/?cidade=${h.slug}#perto`} aria-current={h.current ? "true" : undefined}>
            {h.cover ? <img src={h.cover} alt="" loading="lazy" decoding="async" /> : null}
            <span className="cc-t">
              <b>{h.city}</b>
              <span>
                {h.count} peças{h.current ? " · você está aqui" : h.dist ? ` · ${h.dist}` : ""}
              </span>
            </span>
          </a>
        ))}
        <a className="cc all" href="/?cidade=brasil#perto">
          <span className="cc-t">
            <b>Brasil todo</b>
            <span>{total} peças, enviadas pra você</span>
          </span>
        </a>
      </div>
    </section>
  );
}
