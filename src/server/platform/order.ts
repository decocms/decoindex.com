import type { Product, Sort } from "../lib/types";

/**
 * Ordering a page of products, shared by every platform.
 *
 * Two separate jobs, and it matters which one the platform did:
 *
 *   selection — *which* products come back. Only the platform can do this
 *               catalog-wide, and it is the valuable half: asking VTEX for
 *               OrderByPriceASC returns the cheapest of 438, not the cheapest
 *               of the 24 we happened to hold.
 *   ordering  — what order the rows appear in. We always do this ourselves,
 *               because the platform's idea of "price" is not always the price
 *               we print, and a table whose own numbers do not ascend is worse
 *               than no ordering at all.
 *
 * VTEX's OrderByPriceASC really does come back out of order against the price
 * it reports: a search for "playstation 5" returned 189.99 before 189.98. Left
 * alone, an agent told the rows are cheapest-first takes row one and is wrong by
 * a cent — small here, arbitrary in general. So the platform picks the set, and
 * we sort what it gave us by the number we actually display.
 */

/** Cheapest live variant — the number the listing table prints for this row. */
export function fromPrice(p: Product): number | undefined {
  const live = p.variants.filter((v) => v.available !== false && v.priceMinor != null);
  const pool = live.length ? live : p.variants.filter((v) => v.priceMinor != null);
  return pool.length ? Math.min(...pool.map((v) => v.priceMinor as number)) : undefined;
}

const inStock = (p: Product) => p.variants.some((v) => v.available);

/**
 * Sorts in place. Returns false when the sort is one we cannot honour from the
 * page alone, so the caller reports no ordering rather than inventing one.
 *
 * In-stock rows always come first. That is what the platforms already do and
 * what a shopper wants, and grouping first means each group's prices ascend
 * cleanly instead of the column zig-zagging between available and sold out.
 */
export function sortProducts(products: Product[], sort: Sort): boolean {
  const byStock = (a: Product, b: Product) => Number(inStock(b)) - Number(inStock(a));

  const byPrice = (dir: number) => (a: Product, b: Product) => {
    const s = byStock(a, b);
    if (s !== 0) return s;
    const x = fromPrice(a);
    const y = fromPrice(b);
    // Unpriced rows sink within their group rather than sorting as zero.
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * dir;
  };

  const byName = (dir: number) => (a: Product, b: Product) => {
    const s = byStock(a, b);
    return s !== 0 ? s : a.title.localeCompare(b.title) * dir;
  };

  switch (sort) {
    case "price_asc": products.sort(byPrice(1)); return true;
    case "price_desc": products.sort(byPrice(-1)); return true;
    case "name_asc": products.sort(byName(1)); return true;
    case "name_desc": products.sort(byName(-1)); return true;
    // discount, new and relevance need catalog-wide data a page does not carry.
    // Leave the platform's order alone and claim nothing.
    default: return false;
  }
}
