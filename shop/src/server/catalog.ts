import type { Tile } from "../types";
import { brandByDomain } from "./brands";
import type { Env } from "./env";

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
 * One search on one storefront, through decoindex. decoindex owns the bound
 * (≤2 upstream calls, cache, per-domain limit); we only forward the shopper's
 * IP so its per-caller limit counts shoppers, not this Worker.
 */
export async function searchBrand(env: Env, domain: string, query: string, ip: string): Promise<Tile[]> {
  const url = `https://decoindex.com/${domain}/search.json?q=${encodeURIComponent(query)}`;
  const init = { headers: { "user-agent": UA, "cf-connecting-ip": ip, accept: "application/json" } };
  try {
    const res = await (env.INDEX ? env.INDEX.fetch(url, init) : fetch(url, init));
    if (!res.ok) return [];
    const doc = (await res.json()) as IndexListing;
    const origin = doc.shop?.origin ?? `https://${domain}`;
    const brand = brandByDomain(domain)?.name ?? doc.shop?.name ?? domain;
    return (doc.products ?? []).map((p) => toTile(env, domain, origin, brand, p));
  } catch {
    return []; // one slow or blocked store must not sink the whole answer
  }
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
