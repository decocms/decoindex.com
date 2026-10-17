import type { Tile } from "../types";
import { BRANDS, brandByDomain } from "./brands";
import { browseCategory, categories, searchBrand, type Health } from "./catalog";
import type { Env } from "./env";
import { TYPES, attributes, detectType, isKids, otherDept, overlap, pickCategory, words, type ProductType } from "./taxonomy";

export type Sort = "relevance" | "price_asc" | "price_desc" | "new" | "discount";

export interface FindRequest {
  domain: string;
  type?: ProductType;
  /** Attributes the shopper cares about: "linho", "azul marinho", "estampado". */
  terms?: string;
  sort?: Sort;
}

export interface Found {
  tiles: Tile[];
  /** How we got them, for the status line and the model: "FARM › Vestido" or "busca: vestido linho". */
  via: string;
}

interface Ctx {
  env: Env;
  ip: string;
  health?: Health;
  dept?: "feminino" | "masculino";
}

const MIN_AFTER_FILTER = 6;

/**
 * The heuristic, per store:
 *   1. type known and the store has a matching category → read that category
 *      page (warm, shared cache key), rank by the shopper's terms locally;
 *   2. too few left after the terms → also run the store's search for
 *      "type terms" and merge (still ≤2 decoindex reads per store);
 *   3. no category → search only.
 */
export async function findProducts(ctx: Ctx, r: FindRequest): Promise<Found> {
  const brand = brandByDomain(r.domain)?.name ?? r.domain;
  const want = r.terms ? words(r.terms) : [];
  const typeWord = r.type ? TYPES[r.type][0] : "";
  const query = [typeWord, r.terms].filter(Boolean).join(" ").trim();

  const pick = r.type ? pickCategory(await categories(ctx.env, r.domain, ctx.ip, ctx.health), r.type, { dept: ctx.dept, sale: r.sort === "discount" }) : undefined;
  const polish = (ts: Tile[]) => fit(ts, { type: r.type, want, dept: ctx.dept, keepOrder: !want.length && !!r.sort });
  if (!pick) {
    return { tiles: query ? polish(await searchBrand(ctx.env, r.domain, query, ctx.ip, ctx.health)) : [], via: `${brand}: busca “${query}”` };
  }

  const page = await browseCategory(ctx.env, r.domain, pick.category.path, ctx.ip, r.sort, ctx.health);
  const label = `${brand} › ${pick.category.name.replace(/^.*>\s*/, "")}`;
  if (!want.length) return { tiles: polish(page), via: label };

  const ranked = polish(page).filter((t) => overlap(want, text(t)) > 0);
  if (ranked.length >= MIN_AFTER_FILTER) return { tiles: ranked, via: `${label} + “${r.terms}”` };

  const searched = await searchBrand(ctx.env, r.domain, query, ctx.ip, ctx.health);
  return { tiles: polish(dedupe([...ranked, ...searched])), via: `${label} + busca “${query}”` };
}

const text = (t: Tile) => `${t.title} ${t.description ?? ""} ${t.category ?? ""}`;

/**
 * The last pass over any list, category or search: drop the other department,
 * push the wrong product type to the end (a search for "camisa linho" also
 * returns t-shirts), then order by how many of the shopper's terms each has.
 * Sort order from the store (price, new) is kept when there is nothing to rank by.
 */
function fit(ts: Tile[], o: { type?: ProductType; want: string[]; dept?: "feminino" | "masculino"; keepOrder?: boolean }): Tile[] {
  const wantsKids = o.want.some((w) => isKids(w));
  const kept = ts.filter((t) => !otherDept(`${t.title} ${t.category ?? ""}`, o.dept) && (wantsKids || !isKids(`${t.title} ${t.category ?? ""}`)));
  const scored = kept.map((t, i) => {
    const seen = detectType(`${t.title} ${t.category ?? ""}`);
    const typeScore = !o.type || !seen ? 0 : seen === o.type ? 2 : -10;
    return { t, i, score: typeScore + overlap(o.want, text(t)) * 3 };
  });
  // keepOrder: only sink the wrong type, otherwise trust the store's price/new order.
  const by = o.keepOrder
    ? (a: (typeof scored)[number], b: (typeof scored)[number]) => Number(a.score < 0) - Number(b.score < 0) || a.i - b.i
    : (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score || a.i - b.i;
  return scored.sort(by).map((x) => x.t);
}

/**
 * "Mais como este" without a model call: same type, same department, ranked by
 * shared attributes and price distance, across the seed's store and up to four
 * stores that sell the same kind of thing. Every read is a category page.
 */
export async function similar(ctx: Ctx, seed: Pick<Tile, "id" | "domain" | "title" | "category" | "priceMinor">): Promise<Found & { type?: ProductType; attrs: string[] }> {
  const type = detectType(`${seed.title} ${seed.category ?? ""}`);
  const attrs = attributes(seed.title, type).slice(0, 5);
  if (!type) {
    const tiles = await searchBrand(ctx.env, seed.domain, attrs.slice(0, 3).join(" "), ctx.ip, ctx.health);
    return { tiles: tiles.filter((t) => t.id !== seed.id), via: "busca", attrs };
  }

  const home = brandByDomain(seed.domain);
  const peers = BRANDS.filter((b) => b.domain !== home?.domain && (!ctx.dept || b.segments.includes(ctx.dept) || b.segments.includes("esporte")))
    .map((b) => ({ b, shared: home ? b.segments.filter((s) => home.segments.includes(s)).length : 0 }))
    .sort((x, y) => y.shared - x.shared)
    .map((x) => x.b.domain);
  const stores = [home?.domain ?? seed.domain, ...peers].slice(0, 8);

  // Trees are memoized, so this is cheap after the first shopper; keep the first 5 that carry the type.
  const withType: { domain: string; path: string }[] = [];
  for (const domain of stores) {
    if (withType.length >= 5) break;
    const pick = pickCategory(await categories(ctx.env, domain, ctx.ip, ctx.health), type, { dept: ctx.dept });
    if (pick) withType.push({ domain, path: pick.category.path });
  }
  if (!withType.length) {
    return { tiles: (await searchBrand(ctx.env, seed.domain, [TYPES[type][0], ...attrs.slice(0, 2)].join(" "), ctx.ip, ctx.health)).filter((t) => t.id !== seed.id), via: "busca", type, attrs };
  }

  const pages = await Promise.all(withType.map((s) => browseCategory(ctx.env, s.domain, s.path, ctx.ip, undefined, ctx.health)));
  const p0 = seed.priceMinor;
  const scored = fit(pages.flat(), { type, want: [], dept: ctx.dept })
    .filter((t) => t.id !== seed.id)
    .map((t) => {
      const shared = overlap(attrs, `${t.title} ${t.description ?? ""}`);
      const price = p0 && t.priceMinor ? Math.max(0, 1 - Math.abs(t.priceMinor - p0) / p0) : 0;
      const seen = detectType(`${t.title} ${t.category ?? ""}`);
      const sameType = !seen ? 0 : seen === type ? 2 : -10;
      return { t, score: sameType + shared * 3 + price * 2 + (t.domain === seed.domain ? 0.5 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
    .map((x) => x.t);
  const names = withType.map((s) => brandByDomain(s.domain)?.name ?? s.domain);
  return { tiles: scored, via: names.join(", "), type, attrs };
}


function dedupe(ts: Tile[]): Tile[] {
  const seen = new Set<string>();
  return ts.filter((t) => !seen.has(t.id) && seen.add(t.id));
}
