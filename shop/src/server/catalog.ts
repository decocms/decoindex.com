import type { Tile } from "../types";
import { brandByDomain } from "./brands";
import type { Env } from "./env";
import { toCategories, type Category } from "./taxonomy";

const UA = "decoshop/0.1 (+https://shop.decoindex.com)";

/** The subset of decoindex's listing JSON we read. */
interface IndexListing {
  shop?: { origin?: string; name?: string };
  products?: {
    id: string;
    slug: string;
    title: string;
    brand?: string;
    description?: string;
    categories?: string[];
    images?: string[];
    variants?: {
      priceMinor?: number;
      listPriceMinor?: number;
      currency?: string;
      available?: boolean;
      attributes?: Record<string, string>;
    }[];
  }[];
}

/**
 * One read of decoindex through the binding. decoindex owns the bound (≤2
 * upstream calls, cache, per-domain limit); we only forward the shopper's IP so
 * its per-caller limit counts shoppers, not this Worker.
 */
async function read<T>(env: Env, domain: string, pathAndQuery: string, ip: string): Promise<T | null> {
  const url = `https://decoindex.com/${domain}${pathAndQuery}`;
  const init = { headers: { "user-agent": UA, "cf-connecting-ip": ip, accept: "application/json" } };
  try {
    const res = await (env.INDEX ? env.INDEX.fetch(url, init) : fetch(url, init));
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null; // one slow or blocked store must not sink the whole answer
  }
}

function tiles(env: Env, domain: string, doc: IndexListing | null): Tile[] {
  if (!doc) return [];
  const origin = doc.shop?.origin ?? `https://${domain}`;
  const brand = brandByDomain(domain)?.name ?? doc.shop?.name ?? domain;
  return (doc.products ?? []).map((p) => toTile(env, domain, origin, brand, p));
}

/** Free-text search through the merchant's own search, via decoindex. */
export async function searchBrand(env: Env, domain: string, query: string, ip: string): Promise<Tile[]> {
  return tiles(env, domain, await read<IndexListing>(env, domain, `/search.json?q=${encodeURIComponent(query)}`, ip));
}

/** One category page (page 1). The same URL for every shopper, so it is the warm path. */
export async function browseCategory(env: Env, domain: string, path: string, ip: string, sort?: string): Promise<Tile[]> {
  const q = sort && sort !== "relevance" ? `?sort=${sort}` : "";
  return tiles(env, domain, await read<IndexListing>(env, domain, `${path}.json${q}`, ip));
}

type RawCategory = { path: string; name: string; depth?: number; count?: number; parent?: string };
const treeMemo = new Map<string, { at: number; cats: Category[] }>();
const TREE_TTL = 6 * 60 * 60 * 1000;

/**
 * A store's category tree (from its decoindex storefront doc), normalized.
 * Memoized per isolate: trees change with collections, not per request.
 */
export async function categories(env: Env, domain: string, ip: string): Promise<Category[]> {
  const hit = treeMemo.get(domain);
  if (hit && Date.now() - hit.at < TREE_TTL) return hit.cats;
  const doc = await read<{ categories?: RawCategory[] }>(env, domain, "/.json", ip);
  const cats = toCategories(doc?.categories ?? []);
  // An empty tree from a failed read is retried sooner than a real one.
  treeMemo.set(domain, { at: doc ? Date.now() : Date.now() - TREE_TTL + 60_000, cats });
  return cats;
}

function toTile(
  env: Env,
  domain: string,
  origin: string,
  brand: string,
  p: NonNullable<IndexListing["products"]>[number],
): Tile {
  const variants = p.variants ?? [];
  const priced = variants.find((v) => v.available !== false && v.priceMinor) ?? variants.find((v) => v.priceMinor);
  const url = new URL(p.slug, origin);
  url.searchParams.set(env.ATTRIBUTION_PARAM, env.ATTRIBUTION_VALUE);
  const sizes = [
    ...new Set(
      variants
        .filter((v) => v.available !== false)
        .map((v) => v.attributes?.tamanho ?? v.attributes?.Tamanho ?? v.attributes?.size ?? v.attributes?.Size)
        .filter((s): s is string => !!s),
    ),
  ];
  return {
    id: `${domain}:${p.id}`,
    domain,
    brand,
    title: p.title,
    priceMinor: priced?.priceMinor,
    listPriceMinor: priced?.listPriceMinor,
    currency: priced?.currency ?? "BRL",
    images: (p.images ?? []).slice(0, 4),
    url: url.toString(),
    sizes,
    category: p.categories?.at(-1),
    description: p.description?.slice(0, 400),
  };
}

/** What the model reads about a tile: one line, no images, no URLs. */
export function tileLine(t: Tile): string {
  const price = t.priceMinor ? `R$ ${(t.priceMinor / 100).toFixed(0)}` : "sem preço";
  const off = t.listPriceMinor && t.priceMinor && t.listPriceMinor > t.priceMinor ? " (promo)" : "";
  return `${t.id} | ${t.brand} | ${t.title} | ${price}${off} | ${t.category ?? ""} | tam: ${t.sizes.join(",") || "?"}`;
}
