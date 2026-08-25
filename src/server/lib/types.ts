export type Platform = "vtex" | "shopify" | "nuvemshop" | "tray" | "unknown";

export type IndexStatus =
  | "queued" // known domain, nothing ingested yet
  | "discovered" // built from public sources only
  | "merchant-verified" // merchant claimed the domain and connected a source
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

export interface StorefrontMeta {
  domain: string;
  platform: Platform;
  status: IndexStatus;
  name?: string;
  locale: string;
  currency: string;
  productCount: number;
  catalogFreshness?: string; // ISO
  lastError?: string;
}

export interface SearchHit {
  product: Product;
  score: number;
  why: string[]; // human/agent-readable reasons the hit matched
}
