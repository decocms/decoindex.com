import { Hb, Kick } from "~/components/ui";

const ICONS = {
  carteira: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="6" width="18" height="13" rx="1" />
      <path d="M3 10h18M16 14h2" />
    </svg>
  ),
  sacola: (
    <svg viewBox="0 0 24 24">
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </svg>
  ),
  grafico: (
    <svg viewBox="0 0 24 24">
      <path d="m4 16 5-5 4 4 7-7M15 8h5v5" />
    </svg>
  ),
};

/** @titleBy label */
export interface Role {
  /** @title Rótulo */
  label: string;
  /** @title Frase */
  text: string;
  /** @title Ícone */
  icon: keyof typeof ICONS;
}

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @title Título */
  title?: string;
  /** @title Segunda linha (cinza) */
  dim?: string;
  /** @title Colunas */
  roles?: Role[];
}

export default function Roles({ kicker = "O que fazemos", title = "", dim = "", roles = [] }: Props) {
  return (
    <section className="wrap roles">
      <Kick>{kicker}</Kick>
      <Hb dim={dim}>{title}</Hb>
      <div className="cols">
        {roles.map((r) => (
          <div key={r.label}>
            <span className="ib">{ICONS[r.icon] ?? ICONS.carteira}</span>
            <div>
              <p className="k2">{r.label}</p>
              <b>{r.text}</b>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
