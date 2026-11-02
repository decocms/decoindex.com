import { Arrow, Hb, Kick, Timeline, type Step } from "~/components/ui";

/** @titleBy label */
export interface Action {
  /** @title Texto */
  label: string;
  /** @title Link */
  href: string;
  /** @title Estilo */
  style?: "dark" | "line";
}

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @title Título */
  title?: string;
  /** @title Segunda linha (cinza) */
  dim?: string;
  /** @title Passos */
  steps?: Step[];
  /** @title Botões */
  actions?: Action[];
}

export default function HowItWorks({ kicker = "Como funciona", title = "Alugar é simples.", dim = "E a peça volta a girar.", steps = [], actions = [] }: Props) {
  return (
    <section className="how wrap">
      <Kick>{kicker}</Kick>
      <Hb dim={dim}>{title}</Hb>
      <Timeline steps={steps} />
      {actions.length ? (
        <div className="l-actions">
          {actions.map((a) => (
            <a key={a.label} className={`btn ${a.style ?? "dark"}`} href={a.href}>
              {a.label} {a.style === "line" ? null : <Arrow />}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
