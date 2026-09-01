export type Platform = "vtex" | "shopify" | "unknown";

export type DomainStatus =
  | "active" // supported platform, serving
  | "unsupported" // reachable, but not a platform we can read
  | "blocked" // the origin refuses us (403 / WAF)
  | "opted-out"; // merchant asked us to stop

export type Confidence = "asserted" | "verified" | "inferred";

/** A single fact about a product, with where it came from and when. */
export interface Claim {
  predicate: string; // e.g. "material", "color", "care"
  value: string;
  source: string; // e.g. "vtex:catalog_system", "shopify:products.json"
  observedAt: string; // ISO
  confidence: Confidence;
}

export interface Variant {
  skuId: string;
  name: string;
  /** Price in minor units (centavos) to avoid float drift. */
  priceMinor?: number;
  listPriceMinor?: number;
  currency: string;
  /** Public availability signal only. Never a delivery promise. */
  available?: boolean;
  attributes: Record<string, string>; // size, color, ...
  /** Deep link that creates a cart on the merchant's own checkout. */
  cartUrl?: string;
}

export interface Product {
  id: string; // stable within a storefront
  slug: string; // canonical path on the merchant site, no origin
  title: string;
  brand?: string;
  description?: string; // normalized summary, NOT a verbatim copy
  categories: string[]; // normalized breadcrumb, root first
  images: string[]; // absolute URLs on the merchant's domain (never rehosted)
  variants: Variant[];
  claims: Claim[];
  observedAt: string;
}

/** What we know about a storefront. Comes straight from the registry row. */
export interface Storefront {
  domain: string;
  platform: Platform;
  /** The merchant's own site. Canonical links and cart URLs point here. */
  origin: string;
  /**
   * Where we actually call the catalog API. Often the same as `origin`, but a
   * merchant running a custom frontend may intercept the platform's API paths
   * and answer with their storefront HTML — VTEX exposes a canonical host that
   * doesn't. Fetch from here, link to `origin`.
   */
  apiOrigin?: string;
  name?: string;
  account?: string;
  currency: string;
  country?: string;
  /** The merchant's own words about themselves. Attributed, never rewritten. */
  description?: string;
  logoUrl?: string;
  themeColor?: string;
  locale?: string;
  /** Merchant has signed up: their data, their page, no promo footer. */
  claimed?: boolean;
}

export interface CategoryRef {
  /** Path on the merchant's own site, so `{origin}/{domain}{path}` just works. */
  path: string;
  name: string;
  count?: number;
  /** 0 = top level. Lets the renderer show every root before any child. */
  depth: number;
  /** Name of the root this sits under, for grouping. */
  parent?: string;
}

/**
 * How a listing is ordered.
 *
 * "Which of these is cheapest" is the most ordinary shopping question there is,
 * and one page of an arbitrarily ordered catalog cannot answer it — a category
 * with 133 products hands back 24 of them and the cheapest is very likely in the
 * other 109. So ordering is part of the read, not a nicety.
 */
export const SORTS = ["price_asc", "price_desc", "name_asc", "name_desc", "discount", "new", "relevance"] as const;
export type Sort = (typeof SORTS)[number];

export function parseSort(raw: string | null | undefined): Sort | undefined {
  const v = raw?.trim().toLowerCase();
  return (SORTS as readonly string[]).includes(v ?? "") ? (v as Sort) : undefined;
}

/** What a resolver returns for one URL. */
export type Doc =
  | { kind: "product"; product: Product }
  | {
      kind: "listing";
      title: string;
      description?: string;
      total?: number;
      page: number;
      products: Product[];
      /** Echoed back so a reader knows what order they are looking at. */
      sort?: Sort;
      /**
       * True when the platform could not order the query for us and we ordered
       * the page we already had. That is page-local, not catalog-wide, and the
       * document has to say so — an agent that reports the cheapest of 24 as the
       * cheapest of 133 is confidently wrong, which is the one thing we cannot be.
       */
      sortedWithinPage?: boolean;
      /**
       * Categories directly beneath this one. The overview truncates its tree to
       * stay readable, so without this the categories it does not list would be
       * unreachable — the reader is told "26 more" and given no way to see them.
       */
      subcategories?: CategoryRef[];
      /** Set when this listing came from a search rather than a category. */
      query?: string;
    }
  | {
      kind: "home";
      categories: CategoryRef[];
      totalCategories?: number;
      /**
       * What the storefront actually sells most of, and what shoppers actually
       * type. Both come from the platform, not from us — VTEX publishes a
       * best-seller ordering and its own top-search terms with real volumes.
       * Absent where the platform has no such signal; we do not manufacture one.
       */
      popular?: Product[];
      /** How `popular` was determined, so the document can say it plainly. */
      popularBasis?: "best-selling" | "featured";
      topSearches?: { term: string; count?: number }[];
    }
  | { kind: "notfound" }
  /**
   * The merchant's API did not answer. Distinct from notfound on purpose: an
   * agent told "this product does not exist" acts on it, and a storefront
   * throttling us is not the same fact as a discontinued SKU.
   */
  | { kind: "upstream_error" };
