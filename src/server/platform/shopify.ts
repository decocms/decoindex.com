import type { CategoryRef, Claim, Doc, Product, Storefront, Variant } from "../lib/types";
import { UA } from "./detect";
import { summarize } from "./vtex";

/**
 * Shopify's storefront paths map one-to-one onto public JSON endpoints, which is
 * what lets us answer any URL without a crawl:
 *
 *   /products/{handle}               -> /products/{handle}.json
 *   /collections/{h}                 -> /collections/{h}/products.json?page=N
 *   /collections/{c}/products/{h}    -> /products/{h}.json
 *
 * A missing collection answers `200 {"products":[]}`, so an empty list is the
 * not-found signal — same as VTEX.
 */

const PER_PAGE = 24;
const TIMEOUT = 6_000;

export async function resolveShopify(
  shop: Storefront,
  path: string,
  query: URLSearchParams,
): Promise<Doc> {
  if (path === "/") return home(shop);

  const productHandle = path.match(/\/products\/([^/?]+)\/?$/)?.[1];
  if (productHandle) {
    const body = await getJson<{ product?: ShopifyProduct }>(
      `${shop.origin}/products/${encodeURIComponent(productHandle)}.json`,
    );
    return body?.product
      ? { kind: "product", product: toProduct(body.product, shop) }
      : { kind: "notfound" };
  }

  const collectionHandle = path.match(/\/collections\/([^/?]+)\/?$/)?.[1];
  if (collectionHandle) return collection(shop, collectionHandle, query);

  return { kind: "notfound" };
}

async function home(shop: Storefront): Promise<Doc> {
  const body = await getJson<{ collections?: ShopifyCollection[] }>(
    `${shop.origin}/collections.json?limit=50`,
  );
  const list = body?.collections ?? [];
  if (!list.length) return { kind: "notfound" };
  const categories: CategoryRef[] = list.map((c) => ({
    path: `/collections/${c.handle}`,
    name: c.title ?? c.handle,
    count: c.products_count,
  }));
  return { kind: "home", categories };
}

async function collection(
  shop: Storefront,
  handle: string,
  query: URLSearchParams,
): Promise<Doc> {
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
  const h = encodeURIComponent(handle);

  // Two calls, issued together: one for the collection's own title/description,
  // one for the products. Still inside the per-read budget.
  const [meta, products] = await Promise.all([
    getJson<{ collection?: ShopifyCollection }>(`${shop.origin}/collections/${h}.json`),
    getJson<{ products?: ShopifyProduct[] }>(
      `${shop.origin}/collections/${h}/products.json?limit=${PER_PAGE}&page=${page}`,
    ),
  ]);

  const list = products?.products ?? [];
  if (!list.length) return { kind: "notfound" };
  return {
    kind: "listing",
    title: meta?.collection?.title ?? handle.replace(/-/g, " "),
    description: meta?.collection?.description
      ? summarize(meta.collection.description, 400)
      : undefined,
    total: meta?.collection?.products_count,
    page,
    products: list.map((p) => toProduct(p, shop)),
  };
}

function toProduct(p: ShopifyProduct, shop: Storefront): Product {
  const observedAt = new Date().toISOString();
  const optionNames = (p.options ?? []).map((o) => o.name);

  const variants: Variant[] = (p.variants ?? []).map((v) => {
    const attributes: Record<string, string> = {};
    [v.option1, v.option2, v.option3].forEach((val, i) => {
      if (val && optionNames[i]) attributes[slugify(optionNames[i]!)] = val;
    });
    const available = availability(v);
    return {
      skuId: String(v.id),
      name: v.title,
      priceMinor: v.price ? Math.round(parseFloat(v.price) * 100) : undefined,
      listPriceMinor: v.compare_at_price
        ? Math.round(parseFloat(v.compare_at_price) * 100)
        : undefined,
      currency: shop.currency,
      available,
      // Permalink that creates a cart on the merchant's own checkout, with
      // attribution. It does not complete a purchase.
      cartUrl: available ? `${shop.origin}/cart/${v.id}:1?ref=decoindex` : undefined,
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
    images: (p.images ?? []).map((i) => i.src).slice(0, 4),
    variants,
    claims,
    observedAt,
  };
}

/**
 * Shopify's two public product endpoints disagree about how they express stock,
 * and only one of them is ever right for a given call:
 *
 *   /collections/{h}/products.json  ->  `available: true`, no inventory numbers
 *   /products/{handle}.json         ->  no `available`, but inventory_* fields
 *
 * Reading only `available` silently marks every product fetched by handle as
 * sold out, which costs the merchant the sale. Fall back to the inventory
 * fields, in Shopify's own order of precedence.
 */
function availability(v: ShopifyVariant): boolean | undefined {
  if (typeof v.available === "boolean") return v.available;
  // Untracked inventory: Shopify always allows the sale.
  if (!v.inventory_management) return true;
  // The merchant opted into overselling.
  if (v.inventory_policy === "continue") return true;
  if (typeof v.inventory_quantity === "number") return v.inventory_quantity > 0;
  return undefined;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface ShopifyCollection {
  handle: string;
  title?: string;
  description?: string;
  products_count?: number;
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
  variants?: ShopifyVariant[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  price?: string;
  compare_at_price?: string | null;
  /** Only present on the collection/list endpoints. See availability(). */
  available?: boolean;
  /** Only present on /products/{handle}.json. See availability(). */
  inventory_quantity?: number;
  inventory_policy?: string;
  inventory_management?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
}
