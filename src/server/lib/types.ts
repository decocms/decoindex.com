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
  origin: string;
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
    }
  | { kind: "home"; categories: CategoryRef[] }
  | { kind: "notfound" };
