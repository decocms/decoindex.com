import type { CategoryRef, Claim, Doc, Product, Sort, Storefront, Variant } from "../lib/types";
import { parseSort } from "../lib/types";
import { sortProducts } from "./order";
import type { Env } from "../env";
import { UA } from "./detect";
import { childrenOf, flatten, getTree } from "./tree";

/**
 * VTEX hands out catalog data as JSON with no auth, addressed by the same paths
 * the storefront uses. That is what makes URL-swapping work without a crawl:
 *
 *   /{slug}/p          -> products/search/{slug}/p
 *   /{a}/{b}           -> products/search/{a}/{b}   (category path, verbatim)
 *
 * Both answer `200 []` for a miss rather than 404, so an empty array *is* the
 * not-found signal.
 */

const PER_PAGE = 24;
const TIMEOUT = 6_000;

/**
 * Where to call the catalog API.
 *
 * A merchant's own domain is not always safe to call: farmrio's frontend answers
 * `/api/catalog_system/pub/products/search/{category}?_from=..` with 2.7 MB of
 * storefront HTML, because unknown paths fall through to their SPA. That parsed
 * as "no products" and rendered a category with 135 items as Not Found.
 *
 * Every VTEX account also answers on `{account}.vtexcommercestable.com.br`,
 * which sits behind any custom frontend and cannot be intercepted. Use it when
 * we know the account; fall back to the merchant domain when we do not.
 */
function api(shop: Storefront): string {
  return shop.apiOrigin ?? shop.origin;
}

export function vtexApiOrigin(account: string | undefined, origin: string): string {
  return account ? `https://${account}.vtexcommercestable.com.br` : origin;
}

export async function resolveVtex(
  env: Env,
  shop: Storefront,
  path: string,
  query: URLSearchParams,
): Promise<Doc> {
  if (path === "/") return home(env, shop);

  if (/\/p\/?$/.test(path)) {
    const slug = path.replace(/\/p\/?$/, "").split("/").filter(Boolean).pop();
    if (!slug) return { kind: "notfound" };
    const raw = await getJson<VtexProduct[]>(
      `${api(shop)}/api/catalog_system/pub/products/search/${encodeURIComponent(slug)}/p`,
    );
    if (raw.failed) return { kind: "upstream_error" };
    return raw.body?.[0]
      ? { kind: "product", product: toProduct(raw.body[0], shop) }
      : { kind: "notfound" };
  }

  const term = searchTerm(path, query);
  if (term !== undefined) return search(shop, term, query);

  return listing(env, shop, path, query);
}

/**
 * Storefront search, on the merchant's own URL conventions.
 *
 * This is not a guess about what an agent might want: ChatGPT, handed the
 * americanas overview, immediately tried `/americanas.com/busca/playstation-5`
 * — it inferred VTEX's own search path and we answered 404. It is also the
 * natural next move after reading the top-search terms the overview publishes.
 *
 * Still one bounded upstream call against one query, so nothing about the read
 * invariant changes; this is a listing addressed by words instead of by path.
 */
export function searchTerm(path: string, query: URLSearchParams): string | undefined {
  const q = query.get("q")?.trim();
  const segments = path.split("/").filter(Boolean);
  const head = segments[0]?.toLowerCase();
  if (head === "busca" || head === "search" || head === "s") {
    const rest = segments.slice(1).join(" ").replace(/[-+]/g, " ").trim();
    return (q || rest || "").trim() || undefined;
  }
  // `/search?q=` with no path segments, and `?q=` on the root.
  if (q && (segments.length === 0 || head === "busca" || head === "search")) return q;
  return undefined;
}

/**
 * VTEX selects the set catalog-wide — that is the half we cannot do ourselves,
 * and it is the valuable half. It does not reliably order that set against the
 * price it reports: `?ft=playstation 5&O=OrderByPriceASC` came back 189.99 then
 * 189.98. So take the platform's selection and order it by the number we print,
 * or our own table contradicts its own heading. Used by search and by category
 * listings alike — both had the bug.
 */
function ordered(rows: VtexProduct[], shop: Storefront, sort: Sort | undefined) {
  const products = rows.map((p) => toProduct(p, shop));
  if (sort) sortProducts(products, sort);
  return products;
}

async function search(shop: Storefront, term: string, query: URLSearchParams): Promise<Doc> {
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
  const from = (page - 1) * PER_PAGE;
  const sort = parseSort(query.get("sort"));
  const order = sort ? `&O=${VTEX_ORDER[sort]}` : "";
  // encodeURIComponent, not a `+`: VTEX answers 400 to a plus-encoded space.
  const res = await getWithHeaders<VtexProduct[]>(
    `${api(shop)}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(term)}` +
      `&_from=${from}&_to=${from + PER_PAGE - 1}${order}`,
  );
  if (res.failed) return { kind: "upstream_error" };
  if (!res.body?.length) {
    return { kind: "listing", title: `Search: ${term}`, total: 0, page, products: [], query: term };
  }
  return {
    kind: "listing",
    title: `Search: ${term}`,
    total: totalFromResources(res.resources),
    page,
    sort,
    query: term,
    products: ordered(res.body, shop, sort),
  };
}

const TOP_PRODUCTS = 20;
const TOP_SEARCHES = 15;

/**
 * The overview is the one document where three upstream calls are justified.
 *
 * It is fetched once per storefront, cached indefinitely, and it is the page an
 * agent reads *before* deciding whether this merchant is worth exploring. A list
 * of category names does not answer that; what the store actually sells most of,
 * and what its shoppers actually type into its own search box, does.
 *
 * All three run concurrently and two of them are allowed to fail — a storefront
 * with no best-seller ordering still gets its categories.
 */
async function home(env: Env, shop: Storefront): Promise<Doc> {
  const [tree, top, searches] = await Promise.all([
    // Shared with every category page on this domain, so it is fetched once.
    getTree(env, shop),
    getJson<VtexProduct[]>(
      `${api(shop)}/api/catalog_system/pub/products/search?O=OrderByTopSaleDESC&_from=0&_to=${TOP_PRODUCTS - 1}`,
    ),
    getJson<{ searches?: { term: string; count?: number }[] }>(
      `${api(shop)}/api/io/_v/api/intelligent-search/top_searches`,
    ),
  ]);

  // Only the tree is load-bearing. The other two are enrichment.
  if (!tree) return { kind: "upstream_error" };
  const categories = flatten(tree);
  if (!categories.length) return { kind: "notfound" };

  const popular = (top.body ?? []).map((p) => toProduct(p, shop));
  const topSearches = (searches.body?.searches ?? [])
    .filter((t) => t?.term)
    .slice(0, TOP_SEARCHES)
    .map((t) => ({ term: t.term, count: typeof t.count === "number" ? t.count : undefined }));

  return {
    kind: "home",
    categories,
    totalCategories: Object.keys(tree.nodes).length,
    ...(popular.length ? { popular, popularBasis: "best-selling" as const } : {}),
    ...(topSearches.length ? { topSearches } : {}),
  };
}

/** VTEX orders the whole query server-side, so page 1 really is the cheapest 24. */
const VTEX_ORDER: Record<Sort, string> = {
  price_asc: "OrderByPriceASC",
  price_desc: "OrderByPriceDESC",
  name_asc: "OrderByNameASC",
  name_desc: "OrderByNameDESC",
  discount: "OrderByBestDiscountDESC",
  new: "OrderByReleaseDateDESC",
  relevance: "OrderByScoreDESC",
};

async function listing(
  env: Env,
  shop: Storefront,
  path: string,
  query: URLSearchParams,
): Promise<Doc> {
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
  const from = (page - 1) * PER_PAGE;
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const sort = parseSort(query.get("sort"));
  const order = sort ? `&O=${VTEX_ORDER[sort]}` : "";

  let res = await getWithHeaders<VtexProduct[]>(
    `${api(shop)}/api/catalog_system/pub/products/search/${segments}?_from=${from}&_to=${from + PER_PAGE - 1}${order}`,
  );

  // Not a real category. VTEX collections and CMS pages resolve through cluster
  // ids we cannot see, so fall back to full-text over the slug words — one retry,
  // then we stop. For a commerce agent, wrong is worse than absent.
  if (!res.body?.length && page === 1) {
    const term = path.split("/").filter(Boolean).join(" ").replace(/-/g, " ").trim();
    if (term) {
      res = await getWithHeaders<VtexProduct[]>(
        `${api(shop)}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(term)}&_from=0&_to=${PER_PAGE - 1}${order}`,
      );
    }
  }

  if (res.failed) return { kind: "upstream_error" };
  if (!res.body?.length) return { kind: "notfound" };
  // Free: the index is already in KV for this domain after the first read.
  const subcategories = childrenOf(await getTree(env, shop), path);
  return {
    kind: "listing",
    title: titleFromPath(path),
    total: totalFromResources(res.resources),
    page,
    sort,
    products: ordered(res.body, shop, sort),
    ...(subcategories.length ? { subcategories } : {}),
  };
}

/** `resources: 0-23/135` — the catalog size for this query, for free. */
function totalFromResources(header: string | null): number | undefined {
  const n = header?.match(/\/(\d+)\s*$/)?.[1];
  return n ? Number(n) : undefined;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith("/") ? url : `/${url}`;
  }
}

function titleFromPath(path: string): string {
  return (
    path
      .split("/")
      .filter(Boolean)
      .join(" / ")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "Products"
  );
}

function toProduct(p: VtexProduct, shop: Storefront): Product {
  const observedAt = new Date().toISOString();
  const claims: Claim[] = [];

  for (const name of p.allSpecifications ?? []) {
    const raw = (p as unknown as Record<string, unknown>)[name];
    const value = Array.isArray(raw) ? raw.map(String).join(", ").trim() : "";
    if (!value) continue;
    claims.push({
      predicate: normalizePredicate(name),
      value,
      source: "vtex:catalog_system/allSpecifications",
      observedAt,
      confidence: "asserted",
    });
  }

  const variants: Variant[] = (p.items ?? []).map((item) => {
    const offer = item.sellers?.[0]?.commertialOffer;
    const sellerId = item.sellers?.[0]?.sellerId ?? "1";
    const attributes: Record<string, string> = {};
    // `variations` is an array of *property names*; the values live as top-level
    // keys on the item: variations: ["Tamanho"], item["Tamanho"]: ["U"].
    for (const name of item.variations ?? []) {
      const value = (item as unknown as Record<string, unknown>)[name];
      if (Array.isArray(value) && value.length) {
        attributes[normalizePredicate(name)] = String(value[0]);
      }
    }
    const available = offer ? offer.AvailableQuantity > 0 && offer.IsAvailable !== false : undefined;
    return {
      skuId: item.itemId,
      name: item.name ?? p.productName,
      priceMinor: offer ? Math.round(offer.Price * 100) : undefined,
      listPriceMinor: offer ? Math.round(offer.ListPrice * 100) : undefined,
      currency: shop.currency,
      available,
      attributes,
      cartUrl: available ? cartUrl(shop, item.itemId, sellerId) : undefined,
    };
  });

  // categories arrive as "/Feminino/Vestidos/Longos/" — take the deepest.
  const deepest = [...(p.categories ?? [])].sort((a, b) => b.length - a.length)[0] ?? "";

  return {
    id: `vtex:${p.productId}`,
    slug: `/${p.linkText}/p`,
    title: p.productName,
    brand: p.brand,
    description: summarize(p.description ?? p.metaTagDescription ?? ""),
    categories: deepest.split("/").filter(Boolean),
    images: (p.items?.[0]?.images ?? []).map((i) => i.imageUrl).slice(0, 4),
    variants,
    claims,
    observedAt,
  };
}

/**
 * VTEX's cart-add URL builds the cart on the merchant's own checkout and carries
 * attribution, so agent-driven revenue shows up in the merchant's own reporting
 * with no new pipeline. It does not complete a purchase.
 */
function cartUrl(shop: Storefront, sku: string, seller: string): string {
  return `${shop.origin}/checkout/cart/add?sku=${encodeURIComponent(sku)}&qty=1&seller=${encodeURIComponent(seller)}&sc=1&ref=decoindex`;
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
export function summarize(html: string, maxChars = 1200): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + "…";
}

// --- fetch helpers ----------------------------------------------------------

async function getJson<T>(url: string): Promise<Fetched<T>> {
  return getWithHeaders<T>(url);
}

/**
 * `failed` is the difference between "the catalog has nothing here" and "we
 * never got an answer". Collapsing the two renders a throttled storefront as a
 * 404, which tells an agent the product does not exist — the exact class of
 * confident-and-wrong this service is supposed to avoid.
 */
interface Fetched<T> {
  body: T | null;
  resources: string | null;
  failed: boolean;
}

async function getWithHeaders<T>(url: string): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok && res.status !== 206) return { body: null, resources: null, failed: true };
    if (!(res.headers.get("content-type") ?? "").includes("json")) {
      return { body: null, resources: null, failed: true };
    }
    return { body: (await res.json()) as T, resources: res.headers.get("resources"), failed: false };
  } catch {
    return { body: null, resources: null, failed: true };
  }
}

// --- Upstream shapes (partial; VTEX returns much more than we use) ----------

interface VtexCategory {
  name: string;
  url: string;
  children?: VtexCategory[];
}

interface VtexProduct {
  productId: string;
  productName: string;
  brand?: string;
  linkText: string;
  description?: string;
  metaTagDescription?: string;
  categories?: string[];
  allSpecifications?: string[];
  items?: {
    itemId: string;
    name?: string;
    images?: { imageUrl: string }[];
    /** Array of property *names*, not a map. See toProduct(). */
    variations?: string[];
    sellers?: {
      sellerId?: string;
      commertialOffer: {
        Price: number;
        ListPrice: number;
        AvailableQuantity: number;
        IsAvailable?: boolean;
      };
    }[];
  }[];
}
