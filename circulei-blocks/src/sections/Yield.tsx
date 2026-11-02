import { Calculator, Hb, Kick } from "~/components/ui";

/** @titleBy label */
export interface Row {
  /** @title Investimento */
  label: string;
  /** @title Rendimento anual (%) */
  value: number;
  /** @title Destaque */
  emphasis?: "nenhum" | "média" | "principal";
}

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @title Título */
  title?: string;
  /** @title Segunda linha (cinza) */
  dim?: string;
  /** @title Legenda da tabela */
  caption?: string;
  /** @title Linhas */
  rows?: Row[];
  /** @title Nota */
  fine?: string;
  /** @hide */
  ratio?: number;
}

/** Yearly yield of a piece against fixed income, from Circulei's own numbers, plus the calculator. */
export default function Yield({ kicker = "Moda como ativo", title = "", dim = "", caption = "Rendimento anual sobre o custo da peça", rows = [], fine = "", ratio = 0.23 }: Props) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const cls = { nenhum: "", média: "y-avg", principal: "y-top" } as const;
  return (
    <section className="yield">
      <div className="wrap y-grid">
        <div>
          <Kick>{kicker}</Kick>
          <Hb dim={dim}>{title}</Hb>
          <p className="tl-label">{caption}</p>
          <table className="bars">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={cls[r.emphasis ?? "nenhum"]}>
                  <th>{r.label}</th>
                  <td>
                    <i style={{ ["--w" as string]: `${Math.max(1.5, (r.value / max) * 100).toFixed(1)}%` }} />
                  </td>
                  <td className="v">{r.value.toLocaleString("pt-BR")}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">{fine}</p>
        </div>
        <Calculator ratio={ratio} />
      </div>
    </section>
  );
}
