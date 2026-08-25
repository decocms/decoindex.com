import type { Claim, Product, Variant } from "../lib/types";
import { UA } from "./detect";
import { summarize } from "./vtex";

/** Shopify publishes the catalog at /products.json, 250 at a time, unauthenticated. */

const PAGE = 250;

export async function fetchShopifyPage(
  origin: string,
  page: number,
): Promise<{ products: Product[]; done: boolean }> {
  const url = `${origin}/products.json?limit=${PAGE}&page=${page}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`shopify ${res.status} on ${url}`);
  const body = (await res.json()) as { products: ShopifyProduct[] };
  const list = body.products ?? [];
  return { products: list.map(toProduct), done: list.length < PAGE };
}

export async function fetchShopifyBySlug(origin: string, slug: string): Promise<Product | null> {
  const handle = slug.split("/").filter(Boolean).pop();
  if (!handle) return null;
  const res = await fetch(`${origin}/products/${encodeURIComponent(handle)}.json`, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { product?: ShopifyProduct };
  return body.product ? toProduct(body.product) : null;
}

function toProduct(p: ShopifyProduct): Product {
  const observedAt = new Date().toISOString();
  const optionNames = (p.options ?? []).map((o) => o.name);

  const variants: Variant[] = (p.variants ?? []).map((v) => {
    const attributes: Record<string, string> = {};
    [v.option1, v.option2, v.option3].forEach((val, i) => {
      if (val && optionNames[i]) attributes[slugify(optionNames[i]!)] = val;
    });
    return {
      skuId: String(v.id),
      name: v.title,
      priceMinor: v.price ? Math.round(parseFloat(v.price) * 100) : undefined,
      listPriceMinor: v.compare_at_price
        ? Math.round(parseFloat(v.compare_at_price) * 100)
        : undefined,
      currency: "BRL",
      available: v.available,
      attributes,
    };
  });

  const claims: Claim[] = [];
  if (p.product_type) {
    claims.push({
      predicate: "product_type",
      value: p.product_type,
      source: "shopify:products.json",
      observedAt,
      confidence: "asserted",
    });
  }
  for (const tag of (p.tags ?? []).slice(0, 20)) {
    claims.push({
      predicate: "tag",
      value: tag,
      source: "shopify:products.json/tags",
      observedAt,
      confidence: "asserted",
    });
  }

  return {
    id: `shopify:${p.id}`,
    slug: `/products/${p.handle}`,
    title: p.title,
    brand: p.vendor,
    description: summarize(p.body_html ?? ""),
    categories: p.product_type ? [p.product_type] : [],
    images: (p.images ?? []).map((i) => i.src).slice(0, 8),
    variants,
    claims,
    observedAt,
  };
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Fallback for unknown platforms: schema.org Product JSON-LD, which most
 * storefronts emit for Google. Weaker (usually one price, no full variant
 * matrix) so it is marked `inferred` downstream.
 */
export async function fetchJsonLdProduct(url: string): Promise<Product | null> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  const observedAt = new Date().toISOString();

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]!.trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      const n = node as JsonLdProduct;
      if (n["@type"] !== "Product") continue;
      const offers = Array.isArray(n.offers) ? n.offers : n.offers ? [n.offers] : [];
      const path = new URL(url).pathname;
      return {
        id: `jsonld:${n.sku ?? n.productID ?? path}`,
        slug: path,
        title: n.name ?? "",
        brand: typeof n.brand === "string" ? n.brand : n.brand?.name,
        description: summarize(n.description ?? ""),
        categories: n.category ? [n.category] : [],
        images: (Array.isArray(n.image) ? n.image : n.image ? [n.image] : []).slice(0, 8),
        variants: offers.map((o, i) => ({
          skuId: String(n.sku ?? `${path}#${i}`),
          name: n.name ?? "",
          priceMinor: o.price ? Math.round(parseFloat(String(o.price)) * 100) : undefined,
          currency: o.priceCurrency ?? "BRL",
          available: o.availability ? /InStock/i.test(o.availability) : undefined,
          attributes: {},
        })),
        claims: [
          {
            predicate: "source_format",
            value: "schema.org/Product JSON-LD",
            source: "html:ld+json",
            observedAt,
            confidence: "inferred",
          },
        ],
        observedAt,
      };
    }
  }
  return null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  body_html?: string;
  product_type?: string;
  tags?: string[];
  options?: { name: string }[];
  images?: { src: string }[];
  variants?: {
    id: number;
    title: string;
    price?: string;
    compare_at_price?: string | null;
    available?: boolean;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
  }[];
}

interface JsonLdProduct {
  "@type"?: string;
  name?: string;
  sku?: string;
  productID?: string;
  description?: string;
  category?: string;
  image?: string | string[];
  brand?: string | { name?: string };
  offers?:
    | { price?: string | number; priceCurrency?: string; availability?: string }
    | { price?: string | number; priceCurrency?: string; availability?: string }[];
}
