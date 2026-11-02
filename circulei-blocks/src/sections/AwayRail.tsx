import { Arrow, Card, Hb, Kick } from "~/components/ui";
import type { CardData } from "~/types";

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @title Título */
  title?: string;
  /** @hide */
  total?: number;
  /** @hide */
  count?: number;
  /** @hide */
  cities?: number;
  /** @hide */
  cards?: CardData[];
}

/** Pieces from other cities, shipped. */
export default function AwayRail({ kicker = "Envio pra todo o Brasil", title = "De outros closets.", total = 0, count = 0, cities = 0, cards = [] }: Props) {
  if (!cards.length) return null;
  return (
    <section className="away">
      <div className="wrap sec-head">
        <Kick>{kicker}</Kick>
        <Hb dim={`${count} peças em ${cities} cidades.`}>{title}</Hb>
      </div>
      <div className="rail">
        {cards.map((c, i) => (
          <Card key={c.handle} c={c} i={i + 8} />
        ))}
        <a className="more" href="/?cidade=brasil#perto">
          Ver todas as {total} peças <Arrow />
        </a>
      </div>
    </section>
  );
}
