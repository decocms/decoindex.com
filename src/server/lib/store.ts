import type { Env } from "../env";

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
}

/** How old an entry may get before we refresh it behind the reader's back. */
const MAX_AGE_SECONDS: Record<string, number> = {
  product: 86_400,
  listing: 21_600,
  home: 86_400,
  llms: 86_400,
};

/** Negative answers expire, so the merchant can fix a 404 by publishing. */
const NEGATIVE_TTL = 600;

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
  const options = doc.status === 200 ? {} : { expirationTtl: NEGATIVE_TTL };
  await env.CACHE.put(key, JSON.stringify(doc), options);
}

export function isStale(doc: StoredDoc, surface: string): boolean {
  const maxAge = MAX_AGE_SECONDS[surface] ?? 86_400;
  const age = (Date.now() - Date.parse(doc.renderedAt)) / 1000;
  return !Number.isFinite(age) || age > maxAge;
}
