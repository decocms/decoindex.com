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
    const res = await getJson<{ product?: ShopifyProduct }>(
      `${shop.origin}/products/${encodeURIComponent(productHandle)}.json`,
    );
    if (res.failed) return { kind: "upstream_error" };
    return res.body?.product
      ? { kind: "product", product: toProduct(res.body.product, shop) }
      : { kind: "notfound" };
  }

  const collectionHandle = path.match(/\/collections\/([^/?]+)\/?$/)?.[1];
  if (collectionHandle) return collection(shop, collectionHandle, query);

  return { kind: "notfound" };
}

async function home(shop: Storefront): Promise<Doc> {
  const res = await getJson<{ collections?: ShopifyCollection[] }>(
    `${shop.origin}/collections.json?limit=50`,
  );
  if (res.failed) return { kind: "upstream_error" };
  const list = res.body?.collections ?? [];
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

  if (products.failed) return { kind: "upstream_error" };
  const list = products.body?.products ?? [];
  if (!list.length) return { kind: "notfound" };
  const collectionMeta = meta.body?.collection;
  return {
    kind: "listing",
    title: collectionMeta?.title ?? handle.replace(/-/g, " "),
    description: collectionMeta?.description
      ? summarize(collectionMeta.description, 400)
      : undefined,
    total: collectionMeta?.products_count,
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
  for (const tag of publishableTags(p.tags)) {
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
 * `tags` is an array on the collection endpoints and a comma-separated *string*
 * on /products/{handle}.json. Iterating the string yields one claim per
 * character, which shipped once: a product page listing `tag: a`, `tag: l`,
 * `tag: l`, `tag: b`... spelling out the merchant's first tag one letter at a
 * time. Normalize the type before anything else touches it.
 *
 * Then drop the internal ones. Themes and apps stash machine state in tags
 * (`allbirds::cfId => color-187a11c8`, `carbon-score => undefined`), and a
 * namespace separator or a fat arrow is the reliable tell. An agent learns
 * nothing from those, and they crowd out the tags a shopper would recognise.
 */
function publishableTags(raw: string | string[] | undefined): string[] {
  const all = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return all
    .map((t) => t.trim())
    .filter((t) => t && !t.includes("::") && !t.includes("=>"))
    .slice(0, 20);
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

/**
 * `failed` separates "the collection is empty" from "we never got an answer".
 * A throttled storefront must not render as a 404 — that tells an agent the
 * product does not exist, which is worse than admitting we could not look.
 */
interface Fetched<T> {
  body: T | null;
  failed: boolean;
}

async function getJson<T>(url: string): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    // A missing product genuinely 404s here, unlike the collection endpoints.
    if (res.status === 404) return { body: null, failed: false };
    if (!res.ok) return { body: null, failed: true };
    if (!(res.headers.get("content-type") ?? "").includes("json")) {
      return { body: null, failed: true };
    }
    return { body: (await res.json()) as T, failed: false };
  } catch {
    return { body: null, failed: true };
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
  /** Array on collection endpoints, comma-separated string by handle. */
  tags?: string[] | string;
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
