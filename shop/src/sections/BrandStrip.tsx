/** @titleBy name */
export interface BrandItem {
  name: string;
  /** @title Domínio (abre a loja) */
  domain: string;
}

export interface Props {
  /** @title Título */
  title?: string;
  brands?: BrandItem[];
  /** @title Rodapé */
  footnote?: string;
}

export default function BrandStrip({ title = "Buscando em", brands = [], footnote }: Props) {
  return (
    <footer className="border-t border-line/70 px-5 py-12 md:px-8">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">{title}</p>
      <ul className="mx-auto mt-5 flex max-w-5xl flex-wrap items-center justify-center gap-x-7 gap-y-3">
        {brands.map((b) => (
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
