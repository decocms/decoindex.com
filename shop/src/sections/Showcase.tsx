import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import type { Tile } from "~/types";
import { money, thumb } from "~/components/Product";
import { bus, useBus } from "~/sdk/bus";
import type { Sort } from "~/server/find";
import type { ProductType } from "~/server/taxonomy";
import { getShowcase, type ShowcaseData } from "~/server/showcase";

/** @titleBy label */
export interface CategoryCard {
  /** @title Nome do card */
  label: string;
  /** @title Tipo de peça (vestido, saia, tenis, biquini, bolsa…) */
  type: ProductType;
  /** @title Cor de fundo */
  /** @format color */
  color?: string;
  /** @title Mensagem enviada (vazio = "{label}") */
  prompt?: string;
  /** @title Departamento (vazio = ambos) */
  dept?: "feminino" | "masculino";
}

/** @titleBy text */
export interface Idea {
  /** @title Rótulo, ex.: "Por ocasião" */
  kicker: string;
  /** @title A busca, como o cliente escreveria */
  text: string;
  /** @title Tipo de peça para a foto */
  type?: ProductType;
  /** @title Atributos para a foto, ex.: "estampado" */
  terms?: string;
  dept?: "feminino" | "masculino";
}

/** @titleBy title */
export interface Shelf {
  /** @title Rótulo pequeno */
  kicker?: string;
  title: string;
  /** @title Loja (domínio do roster) */
  domain: string;
  type?: ProductType;
  terms?: string;
  sort?: Sort;
  dept?: "feminino" | "masculino";
}

export interface Props {
  categoriesTitle?: string;
  cards?: CategoryCard[];
  ideasTitle?: string;
  ideasSubtitle?: string;
  ideas?: Idea[];
  shelves?: Shelf[];
}

const PALETTE = ["#b5533c", "#c4a184", "#a8862f", "#2c3e5c", "#2f4a3a", "#3f5f86", "#5a3550", "#6b6b3a"];
const forDept = <T extends { dept?: string }>(xs: T[], dept: string) => xs.filter((x) => !x.dept || x.dept === dept);

export default function Showcase({ categoriesTitle = "O que você procura?", cards = [], ideasTitle = "Buscas em alta.", ideasSubtitle = "O que as pessoas estão pedindo ao deco shop agora.", ideas = [], shelves = [] }: Props) {
  const { dept, started } = useBus();
  const c = forDept(cards, dept);
  const i = forDept(ideas, dept).slice(0, 4);
  const s = forDept(shelves, dept);

  const { data } = useQuery({
    queryKey: ["showcase", dept, c.map((x) => x.type), i.map((x) => [x.type, x.terms]), s.map((x) => [x.domain, x.type, x.terms, x.sort])],
    queryFn: () =>
      getShowcase({
        data: {
          dept,
          cards: c.map((x) => ({ type: x.type })),
          ideas: i.map((x) => ({ type: x.type, terms: x.terms })),
          shelves: s.map((x) => ({ domain: x.domain, type: x.type, terms: x.terms, sort: x.sort })),
        },
      }),
    staleTime: 10 * 60_000,
  });

  if (started) return null;
  const kicker = dept === "masculino" ? "Masculino" : "Feminino";

  return (
    <div className="pb-8">
      {c.length > 0 && (
        <section className="mx-auto max-w-[1280px] px-4 pt-10 md:px-8">
          <Heading kicker="Categorias" title={categoriesTitle} />
          <div className="no-scrollbar -mx-4 mt-5 flex snap-x gap-2.5 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
            {c.map((card, k) => (
              <button
                key={card.label}
                type="button"
                onClick={() => bus.ask(card.prompt || card.label)}
                className="tap-scale group relative flex h-[264px] w-[200px] shrink-0 snap-start flex-col items-center justify-start overflow-hidden rounded-md text-white md:w-[220px]"
                style={{ background: `linear-gradient(180deg, ${card.color || PALETTE[k % PALETTE.length]} 0%, color-mix(in oklab, ${card.color || PALETTE[k % PALETTE.length]} 78%, black) 100%)` }}
              >
                <p className="pt-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">{kicker}</p>
                <p className="mt-1.5 text-[22px] font-medium tracking-tight">{card.label}</p>
                <Fan tiles={data?.cards[c.indexOf(card)]} />
              </button>
            ))}
          </div>
        </section>
      )}

      {i.length > 0 && (
        <section className="mx-auto mt-16 max-w-[1280px] px-4 md:px-8">
          <h2 className="text-[2rem] font-medium leading-tight tracking-[-0.03em] md:text-5xl">{ideasTitle}</h2>
          <p className="mt-2 text-ink-soft">{ideasSubtitle}</p>
          <button type="button" onClick={() => document.querySelector<HTMLTextAreaElement>("textarea")?.focus()} className="tap-scale mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]">
            Começar a conversar <span aria-hidden>→</span>
          </button>
          <div className="mt-8 grid gap-8 md:grid-cols-[1.3fr_1fr] md:gap-12">
            <IdeaFeature idea={i[0]} tile={data?.ideas[0]} />
            <div className="flex flex-col">
              {i.slice(1).map((idea, k) => (
                <IdeaRow key={idea.text} idea={idea} tile={data?.ideas[k + 1]} />
              ))}
            </div>
          </div>
        </section>
      )}

      {s.map((shelf, k) => (
        <ShelfRow key={shelf.title} shelf={shelf} tiles={data?.shelves[k]} />
      ))}
    </div>
  );
}

function Heading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{kicker}</p>
      <h2 className="mt-1.5 text-2xl font-medium tracking-tight md:text-[28px]">{title}</h2>
    </div>
  );
}

/** Three product photos fanned like cards in a hand; skeleton until the showcase lands. */
function Fan({ tiles }: { tiles?: Tile[] }) {
  const [a, b, c] = tiles ?? [];
  const img = (t: Tile | undefined, cls: string) =>
    t ? (
      <img src={thumb(t.images[0], 240)} alt="" loading="lazy" className={`absolute bottom-0 h-[150px] w-[104px] rounded-sm object-cover shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)] transition duration-300 ${cls}`} />
    ) : (
      <span className={`absolute bottom-0 h-[150px] w-[104px] rounded-sm bg-white/15 ${cls}`} />
    );
  return (
    <div className="absolute inset-x-0 bottom-5 h-[160px]">
      {img(b, "left-[14%] -rotate-[8deg] group-hover:-rotate-[12deg] group-hover:-translate-x-1")}
      {img(c, "right-[14%] rotate-[8deg] group-hover:rotate-[12deg] group-hover:translate-x-1")}
      {img(a, "left-1/2 z-10 -translate-x-1/2 group-hover:-translate-y-1")}
    </div>
  );
}

function IdeaFeature({ idea, tile }: { idea: Idea; tile?: Tile | null }) {
  return (
    <button type="button" onClick={() => bus.ask(idea.text)} className="group text-left">
      <div className="aspect-[3/2] overflow-hidden rounded-sm bg-[#f0f0f0]">
        {tile && <img src={thumb(tile.images[0], 960)} alt="" className="h-full w-full object-cover object-[50%_25%] transition duration-500 group-hover:scale-[1.02]" />}
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">✦ {idea.kicker}</p>
      <p className="mt-2 max-w-md text-2xl font-medium leading-snug tracking-tight md:text-3xl">{idea.text}</p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em]">Buscar agora →</p>
    </button>
  );
}

function IdeaRow({ idea, tile }: { idea: Idea; tile?: Tile | null }) {
  return (
    <button type="button" onClick={() => bus.ask(idea.text)} className="group flex items-center gap-5 border-b border-line py-4 text-left first:pt-0">
      <div className="h-[132px] w-[100px] shrink-0 overflow-hidden rounded-sm bg-[#f0f0f0]">
        {tile && <img src={thumb(tile.images[0], 240)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{idea.kicker}</p>
        <p className="mt-1.5 text-lg font-medium leading-snug tracking-tight">{idea.text}</p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft group-hover:text-ink">Buscar agora →</p>
      </div>
    </button>
  );
}

function ShelfRow({ shelf, tiles }: { shelf: Shelf; tiles?: Tile[] }) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });
  if (tiles && !tiles.length) return null;
  return (
    <section className="mt-16 border-t border-line pt-10">
      <div className="mx-auto flex max-w-[1280px] items-end justify-between px-4 md:px-8">
        <Heading kicker={shelf.kicker ?? "Vitrine"} title={shelf.title} />
        <div className="hidden gap-2 md:flex">
          {[-1, 1].map((d) => (
            <button key={d} type="button" aria-label={d < 0 ? "Anterior" : "Próximo"} onClick={() => scroll(d)} className="tap-scale grid size-9 place-items-center rounded-full border border-line hover:border-ink">
              {d < 0 ? "←" : "→"}
            </button>
          ))}
        </div>
      </div>
      <div ref={row} className="no-scrollbar mt-5 flex snap-x gap-3 overflow-x-auto px-4 md:px-8 xl:px-[calc((100vw_-_1280px)/2_+_2rem)]">
        {(tiles ?? Array.from({ length: 6 }, () => null)).map((t, k) =>
          t ? (
            <a key={t.id} href={`/go?${new URLSearchParams({ u: t.url, c: "shelf", id: t.id })}`} target="_blank" rel="noopener" className="tap-scale group w-[46vw] max-w-[240px] shrink-0 snap-start">
              <div className="aspect-[372/498] overflow-hidden rounded-sm bg-[#f0f0f0]">
                <img src={thumb(t.images[0])} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
              </div>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{t.brand}</p>
              <p className="line-clamp-1 text-sm">{t.title}</p>
              <p className="text-sm tabular-nums">{money(t.priceMinor, t.currency)}</p>
            </a>
          ) : (
            <div key={k} className="w-[46vw] max-w-[240px] shrink-0">
              <div className="skeleton aspect-[372/498] rounded-sm" />
            </div>
          ),
        )}
      </div>
    </section>
  );
}

export type { ShowcaseData };

export const eager = true;
export const sync = true;
