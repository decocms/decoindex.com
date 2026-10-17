import type { Tile } from "../types";
import { brandByDomain } from "./brands";
import type { Env } from "./env";
import { deptOf, toCategories, type Category } from "./taxonomy";

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
/**
 * Per-request tally of catalog reads. "The store has nothing" and "we could not
 * read the store" must never look the same: the second once showed shoppers
 * "não encontrei" for hours while decoindex was refusing every shop read.
 */
export interface Health {
  ok: number;
  failed: number;
  statuses: number[];
}
export const newHealth = (): Health => ({ ok: 0, failed: 0, statuses: [] });

async function read<T>(env: Env, domain: string, pathAndQuery: string, ip: string, health?: Health): Promise<T | null> {
  const url = `https://decoindex.com/${domain}${pathAndQuery}`;
  const init = { headers: { "user-agent": UA, "cf-connecting-ip": ip, accept: "application/json" } };
  try {
    const res = await (env.INDEX ? env.INDEX.fetch(url, init) : fetch(url, init));
    // 404 is decoindex answering "no such page/category": a real, empty answer, not an outage.
    // Counting it as a failure turned an empty category into "as lojas não responderam".
    if (res.status === 404) {
      if (health) health.ok++;
      return null;
    }
    if (!res.ok) {
      if (health) {
        health.failed++;
        health.statuses.push(res.status);
      }
      return null;
    }
    if (health) health.ok++;
    return (await res.json()) as T;
  } catch {
    if (health) {
      health.failed++;
      health.statuses.push(0);
    }
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
export async function searchBrand(env: Env, domain: string, query: string, ip: string, health?: Health): Promise<Tile[]> {
  return tiles(env, domain, await read<IndexListing>(env, domain, `/search.json?q=${encodeURIComponent(query)}`, ip, health));
}

/** One category page (page 1). The same URL for every shopper, so it is the warm path. */
export async function browseCategory(env: Env, domain: string, path: string, ip: string, sort?: string, health?: Health): Promise<Tile[]> {
  const q = sort && sort !== "relevance" ? `?sort=${sort}` : "";
  return tiles(env, domain, await read<IndexListing>(env, domain, `${path}.json${q}`, ip, health));
}

type RawCategory = { path: string; name: string; depth?: number; count?: number; parent?: string };
const treeMemo = new Map<string, { at: number; cats: Category[] }>();
const TREE_TTL = 6 * 60 * 60 * 1000;

/**
 * A store's category tree (from its decoindex storefront doc), normalized.
 * Memoized per isolate: trees change with collections, not per request.
 */
export async function categories(env: Env, domain: string, ip: string, health?: Health): Promise<Category[]> {
  const hit = treeMemo.get(domain);
  if (hit && Date.now() - hit.at < TREE_TTL) return hit.cats;
  const doc = await read<{ categories?: RawCategory[] }>(env, domain, "/.json", ip, health);
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
  // VTEX "Cor" / Shopify "Color" variant option. Titles rarely name the color ("Tênis Olympikus
  // Vibra" is blue only in its SKUs), so this is what lets "tênis verde" match across brands.
  const colors = [
    ...new Set(
      variants
        .flatMap((v) => Object.entries(v.attributes ?? {}).filter(([k]) => /^(cor|cores|color|colour)$/i.test(k)).map(([, c]) => c))
        .filter((c): c is string => typeof c === "string" && c.length > 0 && c.length < 40),
    ),
  ].slice(0, 6);
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
    colors,
    category: p.categories?.at(-1),
    dept: deptOf((p.categories ?? []).join(" ")),
    description: p.description?.slice(0, 400),
  };
}

/** What the model reads about a tile: one line, no images, no URLs. */
export function tileLine(t: Tile): string {
  const price = t.priceMinor ? `R$ ${(t.priceMinor / 100).toFixed(0)}` : "sem preço";
  const off = t.listPriceMinor && t.priceMinor && t.listPriceMinor > t.priceMinor ? " (promo)" : "";
  return `${t.id} | ${t.brand} | ${t.title} | ${price}${off} | ${t.category ?? ""}${t.colors?.length ? ` | cor: ${t.colors.join(", ")}` : ""} | tam: ${t.sizes.join(",") || "?"}`;
}
