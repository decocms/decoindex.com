import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import type { Tile } from "~/types";
import { money, thumb } from "~/components/Product";
import { bus, useBus } from "~/sdk/bus";
import type { ProductType } from "~/server/taxonomy";
import { getShowcase, type ShowcaseData } from "~/server/showcase";

/** @titleBy label */
export interface CategoryCard {
  /** @title Nome do card */
  label: string;
  /** @title Tipo de peça (vestido, saia, tenis, biquini, bolsa…) */
  type: ProductType;
  /** @title Termos para a foto (ex.: linho, verde) */
  terms?: string;
  /** @title Cor de fundo */
  /** @format color */
  color?: string;
  /** @title Mensagem enviada (vazio = "{label}") */
  prompt?: string;
  /** @title Departamento (vazio = ambos) */
  dept?: "feminino" | "masculino";
}

/** Another carousel of cards with its own angle: by material, by color… */
export interface CardSection {
  /** @title Rótulo acima do título */
  kicker: string;
  /** @title Título */
  title: string;
  /** @title Cards */
  cards: CategoryCard[];
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
/** A block of ideas, like "Buscas em alta": occasions, styles, seasons. Each one becomes a chat search. */
export interface IdeaSection {
  /** @title Título */
  title: string;
  /** @title Subtítulo */
  subtitle?: string;
  /** @title Ideias (até 4 por departamento) */
  ideas: Idea[];
}

/** @titleBy title */
/** One of the three big editorial photos ("Convidada perfeita"); it runs `text` as a search. */
export interface Editorial {
  /** @title Rótulo, ex.: "Ocasião" */
  kicker: string;
  /** @title Título */
  title: string;
  /** @title Subtítulo */
  subtitle?: string;
  /** @title A busca que roda */
  text: string;
  /** @title Tipo de peça para a foto */
  type?: ProductType;
  /** @title Atributos para a foto */
  terms?: string;
  dept?: "feminino" | "masculino";
}

export interface Props {
  categoriesTitle?: string;
  cards?: CategoryCard[];
  /** @title Mais carrosséis de cards */
  cardSections?: CardSection[];
  ideasTitle?: string;
  ideasSubtitle?: string;
  ideas?: Idea[];
  /** @title Mais blocos de ideias */
  ideaSections?: IdeaSection[];
  editorialTitle?: string;
  editorialSubtitle?: string;
  /** @title Editorial (3 fotos grandes por departamento) */
  editorials?: Editorial[];
}

const PALETTE = ["#b5533c", "#c4a184", "#a8862f", "#2c3e5c", "#2f4a3a", "#3f5f86", "#5a3550", "#6b6b3a"];
const forDept = <T extends { dept?: string }>(xs: T[], dept: string) => xs.filter((x) => !x.dept || x.dept === dept);

export default function Showcase({
  categoriesTitle = "O que você procura?",
  cards = [],
  ideasTitle = "Buscas em alta.",
  ideasSubtitle = "O que as pessoas estão pedindo ao deco shop agora.",
  ideas = [],
  ideaSections = [],
  cardSections = [],
  editorialTitle = "Em alta agora.",
  editorialSubtitle = "O que está sendo procurado.",
  editorials = [],
}: Props) {
  const { dept, started } = useBus();
  // Card carousels in order (categories, then by material, by color…); one flat list goes to the snapshot.
  const rows = [
    { kicker: "Categorias", title: categoriesTitle, cards: forDept(cards, dept) },
    ...cardSections.slice(0, 2).map((r) => ({ kicker: r.kicker, title: r.title, cards: forDept(r.cards ?? [], dept).slice(0, 10) })),
  ].filter((r) => r.cards.length);
  const c = rows.flatMap((r) => r.cards);
  // Every block of ideas, in order: the first is "Buscas em alta". One flat list goes to the snapshot.
  const blocks = [
    { title: ideasTitle, subtitle: ideasSubtitle, ideas: forDept(ideas, dept).slice(0, 4) },
    ...ideaSections.slice(0, 2).map((b) => ({ title: b.title, subtitle: b.subtitle, ideas: forDept(b.ideas ?? [], dept).slice(0, 4) })),
  ].filter((b) => b.ideas.length);
  const eds = forDept(editorials, dept).slice(0, 3);
  // The editorial's photos ride along after the ideas' in the same snapshot.
  const i = [...blocks.flatMap((b) => b.ideas), ...eds];

  const { data } = useQuery({
    queryKey: ["showcase", dept, c.map((x) => [x.type, x.terms]), i.map((x) => [x.type, x.terms])],
    queryFn: () =>
      getShowcase({
        data: {
          dept,
          cards: c.map((x) => ({ type: x.type, terms: x.terms })),
          ideas: i.map((x) => ({ type: x.type, terms: x.terms })),
        },
      }),
    staleTime: 10 * 60_000,
  });

  if (started) return null;
  const kicker = dept === "masculino" ? "Masculino" : "Feminino";
  const offset = (xs: { length: number }[], n: number) => xs.slice(0, n).reduce((sum, x) => sum + x.length, 0);

  // Card rows and idea blocks take turns down the page: categories, ideas, materials, occasions, colors, styles.
  const sections: React.ReactNode[] = [];
  for (let n = 0; n < Math.max(rows.length, blocks.length); n++) {
    if (rows[n]) sections.push(<CardRow key={`r${n}`} row={rows[n]} first={offset(rows.map((r) => r.cards), n)} kicker={kicker} cards={data?.cards} top={n === 0} />);
    if (blocks[n]) sections.push(<IdeaBlock key={`b${n}`} block={blocks[n]} n={n} first={offset(blocks.map((b) => b.ideas), n)} tiles={data?.ideas} />);
    if (n === 0 && eds.length) sections.push(<EditorialRow key="ed" title={editorialTitle} subtitle={editorialSubtitle} items={eds} first={i.length - eds.length} tiles={data?.ideas} />);
  }
  return <div className="pb-8">{sections}</div>;
}

function CardRow({ row, first, kicker, cards, top }: { row: { kicker: string; title: string; cards: CategoryCard[] }; first: number; kicker: string; cards?: Tile[][]; top: boolean }) {
  return (
    <section className={`mx-auto max-w-[1280px] px-4 md:px-8 ${top ? "pt-10" : "mt-16"}`}>
      <Heading kicker={row.kicker} title={row.title} />
      {/* Categories are a grid (everything we carry, jewelry included, at a glance); the other rows scroll. */}
      <div className={top ? "mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4" : "no-scrollbar -mx-4 mt-5 flex snap-x gap-2.5 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8"}>
        {/* A card whose photos came back empty is skipped, never shown as blank placeholders; the grid
            then keeps whole rows of four (a missing Biquínis left a hole in the last row). */}
        {row.cards.map((card, k) => {
          const tiles = cards?.[first + k];
          if (cards && !tiles?.length) return null;
          if (top && cards) {
            const ok = row.cards.map((_, j) => !!cards[first + j]?.length);
            const rank = ok.slice(0, k).filter(Boolean).length;
            const keep = Math.floor(ok.filter(Boolean).length / 4) * 4;
            if (keep >= 4 && rank >= keep) return null;
          }
          const bg = card.color || PALETTE[k % PALETTE.length];
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => bus.ask(card.prompt || card.label)}
              className={`tap-scale group relative flex shrink-0 snap-start flex-col items-center justify-start overflow-hidden rounded-md text-white ${top ? "h-[260px] md:h-[380px]" : "h-[264px] w-[200px] md:w-[220px]"}`}
              style={{ background: `linear-gradient(180deg, ${bg} 0%, color-mix(in oklab, ${bg} 78%, black) 100%)` }}
            >
              <p className="pt-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">{kicker}</p>
              <p className={`mt-1.5 font-medium tracking-tight ${top ? "text-[22px] md:text-[28px]" : "text-[22px]"}`}>{card.label}</p>
              <Fan tiles={tiles} big={top} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function IdeaBlock({ block, n, first, tiles }: { block: { title: string; subtitle?: string; ideas: Idea[] }; n: number; first: number; tiles?: (Tile | null)[] }) {
  const [lead, ...rest] = block.ideas;
  return (
    <section className="mx-auto mt-16 max-w-[1280px] px-4 md:px-8">
      <h2 className="text-[2rem] font-medium leading-tight tracking-[-0.03em] md:text-5xl">{block.title}</h2>
      {block.subtitle && <p className="mt-2 text-ink-soft">{block.subtitle}</p>}
      {n === 0 && (
        <button type="button" onClick={() => document.querySelector<HTMLTextAreaElement>("textarea")?.focus()} className="tap-scale mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]">
          Começar a conversar <span aria-hidden>→</span>
        </button>
      )}
      {/* Blocks alternate sides, so the page doesn't read as the same block three times. */}
      <div className={`mt-8 grid gap-8 md:gap-12 ${n % 2 ? "md:grid-cols-[1fr_1.3fr]" : "md:grid-cols-[1.3fr_1fr]"}`}>
        <div className={n % 2 ? "md:order-2" : ""}>
          <IdeaFeature idea={lead} tile={tiles?.[first]} />
        </div>
        <div className="flex flex-col">
          {rest.map((idea, k) => (
            <IdeaRow key={idea.text} idea={idea} tile={tiles?.[first + k + 1]} />
          ))}
        </div>
      </div>
    </section>
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
function Fan({ tiles, big }: { tiles?: Tile[]; big?: boolean }) {
  const [a, b, c] = tiles ?? [];
  const size = big ? "h-[150px] w-[104px] md:h-[220px] md:w-[152px]" : "h-[150px] w-[104px]";
  const img = (t: Tile | undefined, cls: string) =>
    t ? (
      <img src={thumb(t.images[0], big ? 360 : 240)} alt="" loading="lazy" className={`absolute bottom-0 ${size} rounded-sm object-cover shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)] transition duration-300 ${cls}`} />
    ) : (
      <span className={`absolute bottom-0 ${size} rounded-sm bg-white/15 ${cls}`} />
    );
  return (
    <div className={`absolute inset-x-0 bottom-5 ${big ? "h-[160px] md:h-[236px]" : "h-[160px]"}`}>
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

/** Three big portrait photos with a kicker, a title and a line under it, like a magazine's "trending". */
function EditorialRow({ title, subtitle, items, first, tiles }: { title: string; subtitle?: string; items: Editorial[]; first: number; tiles?: (Tile | null)[] }) {
  return (
    <section className="mx-auto mt-16 max-w-[1280px] px-4 md:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Por busca</p>
      <h2 className="mt-1.5 text-2xl font-medium tracking-tight md:text-[28px]">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      <div className="no-scrollbar -mx-4 mt-5 flex snap-x gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {items.map((e, k) => {
          const tile = tiles?.[first + k];
          if (tiles && !tile) return null;
          return (
            <button key={e.title} type="button" onClick={() => bus.ask(e.text)} className="group w-[78%] shrink-0 snap-start text-left md:w-auto">
              <div className="aspect-[4/5] overflow-hidden bg-[#f0f0f0]">
                {tile && <img src={thumb(tile.images[0], 900)} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_20%] transition duration-700 group-hover:scale-[1.03]" />}
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{e.kicker}</p>
              <p className="mt-1 text-2xl font-medium tracking-tight">{e.title}</p>
              {e.subtitle && (
                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft group-hover:text-ink">
                  {e.subtitle} <span aria-hidden>→</span>
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
