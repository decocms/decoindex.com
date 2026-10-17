import { BRANDS } from "~/server/brands";

export interface Props {
  /**
   * @title Título
   * @description "{n}" vira o número de marcas.
   */
  title?: string;
  /** @title Rodapé */
  footnote?: string;
}

/**
 * The roster in the footer. Read from BRANDS, the same list the chat searches: a CMS copy of it
 * went stale (NV was searchable but missing here, the title still said 57).
 */
export default function BrandStrip({ title = "Buscando em {n} marcas", footnote }: Props) {
  return (
    <footer className="border-t border-line/70 px-5 py-12 md:px-8">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">{title.replace("{n}", String(BRANDS.length))}</p>
      <ul className="mx-auto mt-5 flex max-w-5xl flex-wrap items-center justify-center gap-x-7 gap-y-3">
        {BRANDS.map((b) => (
          <li key={b.domain}>
            <a href={`https://${b.domain}/?ref=decoshop`} target="_blank" rel="noopener" className="font-medium tracking-tight text-2xl text-ink/70 transition hover:text-ink">
              {b.name}
            </a>
          </li>
        ))}
      </ul>
      {footnote && <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-relaxed text-ink-soft">{footnote}</p>}
    </footer>
  );
}

export const eager = true;
export const sync = true;
