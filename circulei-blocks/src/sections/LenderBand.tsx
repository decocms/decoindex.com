import { Arrow, Calculator, Hb, Kick } from "~/components/ui";

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @title Título */
  title?: string;
  /** @title Segunda linha (cinza) */
  dim?: string;
  /** @title Texto em destaque */
  ledeStrong?: string;
  /** @title Texto */
  lede?: string;
  /** @title Botão */
  cta?: string;
  /** @title Link do botão */
  ctaHref?: string;
  /** @hide */
  ratio?: number;
}

/** The black band inviting renters to become owners, with the rental calculator. */
export default function LenderBand({
  kicker = "Moda como ativo",
  title = "Toda mulher tem dinheiro parado no armário.",
  dim = "A Circulei faz ele render.",
  ledeStrong = "Você aporta a peça,",
  lede = "a Circulei cuida da curadoria, da vitrine e de quem aluga, e você recebe no mês seguinte.",
  cta = "Quero circular",
  ctaHref = "/seja-locadora",
  ratio = 0.23,
}: Props) {
  return (
    <section className="lend-cta">
      <div className="wrap lend-grid">
        <div>
          <Kick>{kicker}</Kick>
          <Hb dim={dim}>{title}</Hb>
          <p className="lede">
            <b>{ledeStrong}</b> {lede}
          </p>
          <a className="btn light" href={ctaHref}>
            {cta} <Arrow />
          </a>
        </div>
        <Calculator ratio={ratio} />
      </div>
    </section>
  );
}
