import type { Env } from "../env";
import { RENDER_VERSION } from "./url";

/**
 * The lazy index. A rendered document is written to KV *without* an expiry, so a
 * URL that was ever asked for stays answerable forever — that is the difference
 * between a cache and an index, and it is what lets a read cost nothing the
 * second time.
 *
 * Freshness is handled by age, not by eviction: a stale entry is served
 * immediately and refreshed in the background. Only negative entries expire, so
 * a newly published product is not 404'd for eternity.
 */

export interface StoredDoc {
  body: string;
  status: number;
  contentType: string;
  canonical: string;
  renderedAt: string;
  /** Which renderer produced this. Absent on documents written before v3. */
  renderVersion?: string;
  /** Set on a 3xx: where the caller should go instead. */
  redirectTo?: string;
}

/**
 * How old an entry may get before we refresh it behind the reader's back.
 *
 * One hour for everything. Catalog facts move on their own schedule — a price
 * changes at 9am because someone ran a promotion, not because a document aged
 * out — so a per-surface window was tuning a number nobody could justify. One
 * knob, and the cost of shortening it is bounded: a stale document is still
 * served instantly, so this buys freshness with a background refresh rather
 * than with reader latency.
 *
 * This must stay in step with `TTL.*.edge` in lib/read.ts. The Cache API layer
 * sits in front of KV, so if the edge holds an entry longer than this, the
 * staleness check here simply never runs for that entry.
 */
export const FRESH_SECONDS = 3_600;

/** A genuine miss: expires so a merchant can fix it by publishing the product. */
const NEGATIVE_TTL = 600;
/**
 * An upstream failure or a throttle is transient and not the merchant's answer,
 * so it is held only long enough to stop a retry storm — never long enough to
 * keep telling callers a live product is missing.
 */
const TRANSIENT_TTL = 60;

export function docKey(domain: string, path: string, query: string): string {
  return `md:${domain}${path}${query ? `?${query}` : ""}`;
}

export async function readDoc(env: Env, key: string): Promise<StoredDoc | null> {
  const raw = await env.CACHE.get(key, "json");
  return (raw as StoredDoc) ?? null;
}

export async function writeDoc(env: Env, key: string, doc: StoredDoc): Promise<void> {
  // A 200 is an index entry and never expires. Anything else is a negative
  // result: keep it just long enough to absorb a scan, not long enough to lie.
  const options =
    doc.status === 200
      ? {}
      : { expirationTtl: doc.status >= 500 || doc.status === 429 ? TRANSIENT_TTL : NEGATIVE_TTL };
  await env.CACHE.put(key, JSON.stringify(doc), options);
}

export function isStale(doc: StoredDoc): boolean {
  // A document written by an older renderer is stale no matter how fresh it is.
  // Versioning the KV *key* instead would strand every old entry forever, since
  // index documents are deliberately written without a TTL; this way the reader
  // gets the old body once and the next reader gets the new one.
  if (doc.renderVersion !== RENDER_VERSION) return true;
  const age = (Date.now() - Date.parse(doc.renderedAt)) / 1000;
  return !Number.isFinite(age) || age > FRESH_SECONDS;
}
