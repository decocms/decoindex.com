import type { Env } from "../env";
import type { IndexStatus, Platform } from "./types";

/**
 * The registry is the global view: which domains we know, how they were
 * discovered, when they were last refreshed. The DO owns one storefront's
 * data; D1 owns the list of storefronts and everything cross-cutting.
 */

export interface RegistryRow {
  domain: string;
  status: IndexStatus;
  platform: Platform;
  priority: number; // 100 = seeded from Vitrine, 10 = discovered from traffic
  product_count: number;
  last_refresh: string | null;
  last_error: string | null;
}

export async function getDomain(env: Env, domain: string): Promise<RegistryRow | null> {
  return env.DB.prepare("SELECT * FROM domains WHERE domain = ?").bind(domain).first<RegistryRow>();
}

export async function upsertDomain(
  env: Env,
  domain: string,
  patch: Partial<Omit<RegistryRow, "domain">> = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO domains (domain, status, platform, priority, product_count, last_refresh, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET
       status        = COALESCE(excluded.status, domains.status),
       platform      = COALESCE(excluded.platform, domains.platform),
       priority      = COALESCE(excluded.priority, domains.priority),
       product_count = COALESCE(excluded.product_count, domains.product_count),
       last_refresh  = COALESCE(excluded.last_refresh, domains.last_refresh),
       last_error    = excluded.last_error`,
  )
    .bind(
      domain,
      patch.status ?? "queued",
      // platform/priority/product_count are NOT NULL DEFAULT'd in the schema,
      // but an explicit bound NULL on INSERT overrides a column default (it
      // only applies to an omitted column) — match the schema defaults here
      // instead of relying on them. Pre-existing bug: any first insert of an
      // unseeded domain (e.g. the very first read of a new domain) hit this.
      patch.platform ?? "unknown",
      patch.priority ?? 10,
      patch.product_count ?? 0,
      patch.last_refresh ?? null,
      patch.last_error ?? null,
    )
    .run();
}

/** Stalest first, highest priority first — what the hourly cron refreshes. */
export async function stalest(env: Env, limit: number): Promise<RegistryRow[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM domains
      WHERE status IN ('discovered','merchant-verified')
      ORDER BY priority DESC, COALESCE(last_refresh, '1970') ASC
      LIMIT ?`,
  )
    .bind(limit)
    .all<RegistryRow>();
  return res.results ?? [];
}

/** What a caller with no domain in hand can browse. Biggest catalogs first. */
export async function listDomains(env: Env, limit: number): Promise<RegistryRow[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM domains
      WHERE status IN ('discovered','merchant-verified')
      ORDER BY product_count DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all<RegistryRow>();
  return res.results ?? [];
}

/**
 * First-party analytics. The Worker is the collector — no GA, no PostHog.
 * `surface` is what we actually care about: which representation agents pull.
 */
export async function track(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  event: {
    name: string;
    domain?: string;
    surface?: string;
    ua?: string;
    country?: string;
    ms?: number;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const stmt = env.DB.prepare(
    `INSERT INTO events (ts, name, domain, surface, ua_class, country, ms, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    new Date().toISOString(),
    event.name,
    event.domain ?? null,
    event.surface ?? null,
    classifyClient(event.ua),
    event.country ?? null,
    event.ms ?? null,
    event.meta ? JSON.stringify(event.meta) : null,
  );
  ctx.waitUntil(stmt.run().catch(() => {}));
}

/**
 * The metric that decides whether this business exists: how much of our
 * traffic is agents, and which ones. Bucket rather than store raw UA.
 */
export function classifyClient(ua?: string): string {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  if (/gptbot|oai-searchbot|chatgpt/.test(u)) return "openai";
  if (/claudebot|claude-web|anthropic/.test(u)) return "anthropic";
  if (/perplexity/.test(u)) return "perplexity";
  if (/google-extended|googleother/.test(u)) return "google-ai";
  if (/bytespider|amazonbot|ccbot|applebot/.test(u)) return "other-crawler";
  if (/curl|wget|python|node-fetch|axios|go-http/.test(u)) return "script";
  if (/mozilla|chrome|safari|firefox/.test(u)) return "browser";
  return "unknown";
}
