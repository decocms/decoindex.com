import { useState, type ReactNode } from "react";
import type { CardData } from "~/types";

export const brl = (cents: number) => `R$ ${Math.round(cents / 100).toLocaleString("pt-BR")}`;
export const img = (u: string, w: number) => `${u}${u.includes("?") ? "&" : "?"}width=${w}`;
export const srcset = (u: string) => [360, 540, 800, 1100].map((w) => `${img(u, w)} ${w}w`).join(", ");

const LOGO = "https://cdn.shopify.com/s/files/1/0954/5600/2352/files/";
export const Logo = ({ white = false }: { white?: boolean }) => (
  <img
    src={`${LOGO}${white ? "CIRCULEI_BRANCA_PNG_30bb6b18-8157-4532-9a05-bd0ddc5216b4" : "CIRCULEI_PRETA_PNG_627b741a-4770-4a43-b653-60b6f52139c1"}.png`}
    alt="Circulei"
    width={154}
    height={20}
  />
);

/** The deck's label: an orange square, tracked caps. */
export const Kick = ({ children }: { children: ReactNode }) => (
  <p className="k">
    <i aria-hidden="true" />
    {children}
  </p>
);

/** Two-tone headline: the claim in ink, the second line in gray. */
export const Hb = ({ as: Tag = "h2", children, dim, id }: { as?: "h1" | "h2"; children: ReactNode; dim?: ReactNode; id?: string }) => (
  <Tag className="hb" id={id}>
    {children}
    {dim ? <span className="dim">{dim}</span> : null}
  </Tag>
);

export const Pin = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
export const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function Card({ c, i = 0 }: { c: CardData; i?: number }) {
  return (
    <a className="card" href={`/p/${c.handle}`} style={{ ["--i" as string]: i % 12 }}>
      <span className="ph">
        <img
          src={img(c.img, 540)}
          srcSet={srcset(c.img)}
          sizes="(min-width: 1100px) 22vw, (min-width: 700px) 30vw, 46vw"
          alt={`${c.title}, ${c.brand}`}
          loading={i < 4 ? "eager" : "lazy"}
          decoding="async"
        />
        {c.alt ? <img className="alt" src={img(c.alt, 540)} alt="" loading="lazy" decoding="async" /> : null}
        {c.tag ? <span className={`tag${c.tag.near ? " near" : ""}`}>{c.tag.label}</span> : null}
      </span>
      <span className="meta">
        <span className="brand">{c.brand}</span>
        <span className="title">{c.title}</span>
        <span className="row">
          <b>{brl(c.price4)}</b>
          <span>4 dias</span>
          {c.size ? <span className="size">{c.size}</span> : null}
        </span>
      </span>
    </a>
  );
}

/** @titleBy title */
export interface Step {
  /** @title Passo */
  title: string;
  /** @title Descrição */
  text: string;
}

/** The deck's "como funciona": a rule with a square per step, the last one orange. */
export const Timeline = ({ steps }: { steps: Step[] }) => (
  <ol className="tl">
    {steps.map((s, i) => (
      <li key={s.title}>
        <i aria-hidden="true" />
        <span className="n">{String(i + 1).padStart(2, "0")}</span>
        <b>{s.title}</b>
        <p>{s.text}</p>
      </li>
    ))}
  </ol>
);

export function Calculator({ ratio }: { ratio: number }) {
  const [worth, setWorth] = useState(1500);
  const f = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
  return (
    <div className="calc">
      <label htmlFor="worth">Quanto custou sua peça?</label>
      <output className="worth" htmlFor="worth">
        {f(worth)}
      </output>
      <input id="worth" type="range" min={400} max={8000} step={100} value={worth} onChange={(e) => setWorth(+e.target.value)} />
      <p className="res">
        Peças assim alugam por cerca de <b>{f(worth * ratio)}</b> por 4 dias. Em <b>{Math.ceil(1 / ratio)}</b> aluguéis, o valor da peça já circulou de volta.
      </p>
      <p className="fine">
        Estimativa a partir do catálogo de hoje: o aluguel de 4 dias fica em torno de {Math.round(ratio * 100)}% do preço da peça. O preço final é definido com a curadoria.
      </p>
    </div>
  );
}
