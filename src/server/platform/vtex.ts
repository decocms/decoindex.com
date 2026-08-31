import type { CategoryRef, Claim, Doc, Product, Storefront, Variant } from "../lib/types";
import { UA } from "./detect";

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
  shop: Storefront,
  path: string,
  query: URLSearchParams,
): Promise<Doc> {
  if (path === "/") return home(shop);

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

  return listing(shop, path, query);
}

async function home(shop: Storefront): Promise<Doc> {
  const tree = await getJson<VtexCategory[]>(
    `${api(shop)}/api/catalog_system/pub/category/tree/2`,
  );
  if (tree.failed) return { kind: "upstream_error" };
  if (!tree.body?.length) return { kind: "notfound" };
  const categories: CategoryRef[] = [];
  for (const root of tree.body) {
    categories.push({ path: pathOf(root.url), name: root.name });
    for (const child of root.children ?? []) {
      categories.push({ path: pathOf(child.url), name: `${root.name} > ${child.name}` });
    }
  }
  return { kind: "home", categories };
}

async function listing(shop: Storefront, path: string, query: URLSearchParams): Promise<Doc> {
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
  const from = (page - 1) * PER_PAGE;
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

  let res = await getWithHeaders<VtexProduct[]>(
    `${api(shop)}/api/catalog_system/pub/products/search/${segments}?_from=${from}&_to=${from + PER_PAGE - 1}`,
  );

  // Not a real category. VTEX collections and CMS pages resolve through cluster
  // ids we cannot see, so fall back to full-text over the slug words — one retry,
  // then we stop. For a commerce agent, wrong is worse than absent.
  if (!res.body?.length && page === 1) {
    const term = path.split("/").filter(Boolean).join(" ").replace(/-/g, " ").trim();
    if (term) {
      res = await getWithHeaders<VtexProduct[]>(
        `${api(shop)}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(term)}&_from=0&_to=${PER_PAGE - 1}`,
      );
    }
  }

  if (res.failed) return { kind: "upstream_error" };
  if (!res.body?.length) return { kind: "notfound" };
  return {
    kind: "listing",
    title: titleFromPath(path),
    total: totalFromResources(res.resources),
    page,
    products: res.body.map((p) => toProduct(p, shop)),
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
