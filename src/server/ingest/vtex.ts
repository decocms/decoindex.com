import type { Claim, Product, Variant } from "../lib/types";
import { UA } from "./detect";

/**
 * VTEX runs most of the Brazilian brand ecommerce we care about, and it hands
 * out the entire catalog as JSON: 50 products per call, no auth, no rendering.
 * A 10k SKU catalog is ~200 requests, which is minutes, not days.
 */

const PAGE = 50;
const MAX_WINDOW = 2500; // VTEX refuses _to beyond this; paginate by category past it.

export async function fetchVtexPage(
  origin: string,
  from: number,
): Promise<{ products: Product[]; done: boolean }> {
  const to = Math.min(from + PAGE - 1, MAX_WINDOW);
  const url = `${origin}/api/catalog_system/pub/products/search?_from=${from}&_to=${to}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 206 || res.ok) {
    const raw = (await res.json()) as VtexProduct[];
    return { products: raw.map(toProduct), done: raw.length < PAGE || to >= MAX_WINDOW };
  }
  throw new Error(`vtex ${res.status} on ${url}`);
}

export async function fetchVtexBySlug(origin: string, slug: string): Promise<Product | null> {
  // /produto/nome/p  -> linkText is "nome"
  const linkText = slug.replace(/\/p\/?$/, "").split("/").filter(Boolean).pop();
  if (!linkText) return null;
  const url = `${origin}/api/catalog_system/pub/products/search/${encodeURIComponent(linkText)}/p`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const raw = (await res.json()) as VtexProduct[];
  return raw[0] ? toProduct(raw[0]) : null;
}

function toProduct(p: VtexProduct): Product {
  const observedAt = new Date().toISOString();
  const claims: Claim[] = [];

  for (const [key, values] of Object.entries(p.allSpecifications ? pickSpecs(p) : {})) {
    const value = values.join(", ").trim();
    if (!value) continue;
    claims.push({
      predicate: normalizePredicate(key),
      value,
      source: "vtex:catalog_system/allSpecifications",
      observedAt,
      confidence: "asserted",
    });
  }

  const variants: Variant[] = (p.items ?? []).map((item) => {
    const offer = item.sellers?.[0]?.commertialOffer;
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(item.variations ?? {})) {
      if (Array.isArray(v) && v.length) attributes[normalizePredicate(k)] = String(v[0]);
    }
    // VTEX also exposes variation names as top-level keys on the item.
    for (const key of p.skuSpecifications ?? []) {
      const val = (item as unknown as Record<string, unknown>)[key];
      if (Array.isArray(val) && val.length) attributes[normalizePredicate(key)] = String(val[0]);
    }
    return {
      skuId: item.itemId,
      name: item.name ?? p.productName,
      priceMinor: offer ? Math.round(offer.Price * 100) : undefined,
      listPriceMinor: offer ? Math.round(offer.ListPrice * 100) : undefined,
      currency: "BRL",
      available: offer ? offer.AvailableQuantity > 0 && offer.IsAvailable !== false : undefined,
      attributes,
    };
  });

  // categories arrive as "/Feminino/Vestidos/Longos/" — deepest path first.
  const deepest = (p.categories ?? []).sort((a, b) => b.length - a.length)[0] ?? "";
  const categories = deepest.split("/").filter(Boolean);

  return {
    id: `vtex:${p.productId}`,
    slug: `/${p.linkText}/p`,
    title: p.productName,
    brand: p.brand,
    description: summarize(p.description ?? p.metaTagDescription ?? ""),
    categories,
    images: (p.items?.[0]?.images ?? []).map((i) => i.imageUrl).slice(0, 8),
    variants,
    claims,
    observedAt,
  };
}

function pickSpecs(p: VtexProduct): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const name of p.allSpecifications ?? []) {
    const value = (p as unknown as Record<string, unknown>)[name];
    if (Array.isArray(value) && value.length) out[name] = value.map(String);
  }
  return out;
}

function normalizePredicate(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * We publish normalized facts, not the merchant's marketing copy. Strip HTML,
 * collapse to a couple of sentences. Facts are not protectable; paragraphs are.
 */
export function summarize(html: string, maxChars = 320): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf ("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return (lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + "…");
}

// --- Upstream shapes (partial; VTEX returns much more than we use) ----------

interface VtexProduct {
  productId: string;
  productName: string;
  brand?: string;
  linkText: string;
  description?: string;
  metaTagDescription?: string;
  categories?: string[];
  allSpecifications?: string[];
  skuSpecifications?: string[];
  items?: {
    itemId: string;
    name?: string;
    images?: { imageUrl: string }[];
    variations?: Record<string, string[]>;
    sellers?: {
      commertialOffer: {
        Price: number;
        ListPrice: number;
        AvailableQuantity: number;
        IsAvailable?: boolean;
      };
    }[];
  }[];
}
