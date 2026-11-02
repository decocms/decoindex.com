import { Logo } from "~/components/ui";

/** @titleBy label */
export interface FooterLink {
  /** @title Texto */
  label: string;
  /** @title Link */
  href: string;
}

export interface Props {
  /** @title Frase em destaque */
  taglineStrong?: string;
  /** @title Frase */
  tagline?: string;
  /** @title Links */
  links?: FooterLink[];
  /** @title Nota de rodapé */
  fine?: string;
}

export default function Footer({
  taglineStrong = "O closet parado vira renda,",
  tagline = "e a peça vira ativo.",
  links = [],
  fine = "Protótipo de vitrine feito pela deco sobre o catálogo público da Circulei. Reservas e pagamentos acontecem em circulei.co.",
}: Props) {
  return (
    <footer className="foot">
      <div className="wrap">
        <a className="logo" href="/">
          <Logo white />
        </a>
        <p className="tagline">
          <b>{taglineStrong}</b> {tagline}
        </p>
        <nav>
          {links.map((l) => (
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <p className="fine">{fine}</p>
      </div>
    </footer>
  );
}
