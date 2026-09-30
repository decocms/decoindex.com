import type { Env } from "../env";

/**
 * We serve people represented by agents — a model reading a product page because
 * someone asked. Not scrapers, not crawlers building a corpus. The named ones
 * live in lib/robots.ts; this is everything else: the `blocklist` table, and the
 * hourly sweep that fills it.
 *
 * Amazon is why this exists. Refused as Amazonbot, it came back as
 * Amzn-SearchBot; refused again, it came back six seconds later as a forged Mac
 * Chrome UA from the same network. A static list loses that race by design.
 */

type Cf = Request["cf"];

const ANY = 0;
const RULES_TTL_MS = 60_000;
let memo: { at: number; rules: Map<string, number> } | null = null;
const keyOf = (asn: number, ua: string) => `${asn}|${ua}`;

/**
 * The rule that refuses this client, if any. Read from D1 at most once a minute
 * per isolate — the check sits in front of every request, and a blocklist a
 * minute stale is fine where a D1 round trip on every read is not. Fails open:
 * a D1 hiccup must not take the service down with it.
 */
export async function blockRuleFor(env: Env, ua: string | undefined, cf: Cf): Promise<number | undefined> {
  if (!ua) return undefined;
  const now = Date.now();
  if (!memo || now - memo.at > RULES_TTL_MS) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, asn, ua FROM blocklist WHERE expires_at IS NULL OR expires_at > ?`,
      )
        .bind(new Date(now).toISOString())
        .all<{ id: number; asn: number; ua: string }>();
      memo = { at: now, rules: new Map((results ?? []).map((r) => [keyOf(r.asn, r.ua), r.id])) };
    } catch {
      memo = { at: now, rules: memo?.rules ?? new Map() };
    }
  }
  const u = ua.slice(0, 200); // events store the UA truncated; rules match that form
  return memo.rules.get(keyOf(Number(cf?.asn) || ANY, u)) ?? memo.rules.get(keyOf(ANY, u));
}

/**
 * What "scraper-like" means, in one place. One network + one exact UA reading
 * this many documents, across this many distinct paths, inside one hour. A
 * person's agent reads a handful of pages per question; a catalog walk reads
 * hundreds. The forged-Chrome Amazon crawl ran ~165 reads/h over ~160 paths.
 */
export const SWEEP = { reads: 100, paths: 60, windowMs: 3_600_000, blockDays: 7 };

/**
 * Model vendors fetching for a user share one UA across all of their users, so
 * their volume is many people, not one crawler. Exempt only when Cloudflare has
 * verified them — the UA alone is exactly what a scraper forges.
 */
const VERIFIED_EXEMPT = new Set(["openai", "anthropic", "perplexity", "google-ai", "search-engine"]);

export async function sweepScrapers(env: Env): Promise<number> {
  const now = Date.now();
  const since = new Date(now - SWEEP.windowMs).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT json_extract(meta,'$.asn') asn, MAX(json_extract(meta,'$.aso')) aso,
            json_extract(meta,'$.ua') ua, MAX(ua_class) ua_class, MAX(json_extract(meta,'$.bot')) bot,
            COUNT(*) n, COUNT(DISTINCT json_extract(meta,'$.path')) paths
       FROM events
      WHERE name = 'read' AND ts >= ? AND json_extract(meta,'$.ua') IS NOT NULL
      GROUP BY 1, 3
     HAVING n >= ? AND paths >= ?`,
  )
    .bind(since, SWEEP.reads, SWEEP.paths)
    .all<{ asn: number | null; aso: string | null; ua: string; ua_class: string; bot: string | null; n: number; paths: number }>();

  const offenders = (results ?? []).filter((r) => !(r.bot && VERIFIED_EXEMPT.has(r.ua_class)));
  if (!offenders.length) return 0;

  const expires = new Date(now + SWEEP.blockDays * 86_400_000).toISOString();
  await env.DB.batch(
    offenders.map((r) =>
      env.DB.prepare(
        `INSERT INTO blocklist (asn, aso, ua, source, reason, reads, paths, created_at, expires_at)
         VALUES (?, ?, ?, 'auto', ?, ?, ?, ?, ?)
         ON CONFLICT (asn, ua) DO UPDATE SET
           reads = excluded.reads, paths = excluded.paths, reason = excluded.reason,
           -- a manual permanent block stays permanent
           expires_at = CASE WHEN blocklist.expires_at IS NULL THEN NULL ELSE excluded.expires_at END`,
      ).bind(
        Number(r.asn) || ANY,
        r.aso,
        r.ua,
        `${r.n} reads over ${r.paths} paths in 1h (${r.ua_class})`,
        r.n,
        r.paths,
        new Date(now).toISOString(),
        expires,
      ),
    ),
  );
  memo = null;
  return offenders.length;
}
