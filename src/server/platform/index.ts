import type { Doc, Storefront } from "../lib/types";
import { resolveShopify } from "./shopify";
import { resolveVtex } from "./vtex";

export { detectPlatform, UA } from "./detect";
export type { Detection } from "./detect";

/**
 * One URL in, one document out. Every resolver is bounded: at most two upstream
 * calls, a 6s timeout each, and never a catalog enumeration. That bound is what
 * makes it safe to do this inside a request handler.
 */
export function resolve(shop: Storefront, path: string, query: URLSearchParams): Promise<Doc> {
  switch (shop.platform) {
    case "vtex":
      return resolveVtex(shop, path, query);
    case "shopify":
      return resolveShopify(shop, path, query);
    default:
      return Promise.resolve({ kind: "notfound" });
  }
}
