import { Arrow, Kick, img } from "~/components/ui";

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @title Título */
  title?: string;
  /** @title Frase em destaque */
  ledeStrong?: string;
  /** @title Frase */
  lede?: string;
  /** @title Botão principal */
  cta?: string;
  /** @title Link do botão principal */
  ctaHref?: string;
  /** @title Botão secundário */
  cta2?: string;
  /** @title Link do botão secundário */
  cta2Href?: string;
  /** @hide */
  stats?: { owners: number; cities: number; pieces: number };
  /** @hide */
  cover?: { img: string; title: string; brand: string; owner: string } | null;
}

export default function LenderHero({
  kicker = "Moda como ativo",
  title = "Invista seu closet",
  ledeStrong = "O closet parado vira renda,",
  lede = "e a peça vira ativo.",
  cta = "Aportar minhas peças",
  ctaHref = "https://aporte-sua-peca.circulei.co/",
  cta2 = "Falar no WhatsApp",
  cta2Href = "https://wa.me/message/NFYDMJGPIXVEI1",
  stats,
  cover,
}: Props) {
  return (
    <section className="hero l-hero">
      <div className="hero-copy">
        <Kick>{kicker}</Kick>
        <h1 className="hw">{title}</h1>
        <p className="lede">
          <b>{ledeStrong}</b> {lede}
        </p>
        <div className="l-actions">
          <a className="btn light" href={ctaHref}>
            {cta} <Arrow />
          </a>
          <a className="btn ghost" href={cta2Href}>
            {cta2}
          </a>
        </div>
        {stats ? (
          <div className="hero-foot">
            <span>{stats.owners} closets</span>
            <span>{stats.cities} cidades</span>
            <span>{stats.pieces} peças no ar</span>
          </div>
        ) : null}
      </div>
      <div className="hero-art one">
        {cover ? (
          <span className="f f0">
            <img src={img(cover.img, 1000)} alt={cover.title} fetchPriority="high" />
            <span>
              {cover.brand} · closet de {cover.owner}
            </span>
          </span>
        ) : null}
      </div>
    </section>
  );
}
