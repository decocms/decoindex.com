import type { Env } from "../env";
import type { DomainStatus, Platform } from "./types";

/**
 * The registry answers one question on the read path: for this domain, which
 * platform API do I call and at which origin? Everything else here is bookkeeping.
 */

export interface RegistryRow {
  domain: string;
  status: DomainStatus;
  platform: Platform;
  origin: string | null;
  account: string | null;
  merchant_name: string | null;
  currency: string;
  country: string | null;
  detected_at: string | null;
  last_error: string | null;
  description: string | null;
  logo_url: string | null;
  theme_color: string | null;
  locale: string | null;
  brand_checked_at: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
}

export async function getDomain(env: Env, domain: string): Promise<RegistryRow | null> {
  return env.DB.prepare("SELECT * FROM domains WHERE domain = ?").bind(domain).first<RegistryRow>();
}

/**
 * Partial upsert: an omitted field keeps whatever is already stored.
 *
 * The conflict branch reads the numbered *parameters* (`?2`, `?3`, …) rather
 * than `excluded.*`, and that distinction is the whole point. `excluded` holds
 * the row the INSERT would have written — already defaulted — so with
 * `VALUES (…, COALESCE(?3,'unknown'), …)` the value `excluded.platform` is never
 * NULL, and `COALESCE(excluded.platform, domains.platform)` silently overwrites
 * a known platform with 'unknown' on every partial write. That shipped: writing
 * a merchant's brand description reset their platform, and the read path then
 * answered 404 for a storefront it had resolved correctly minutes earlier.
 *
 * Referencing `?3` directly gives the UPDATE branch the caller's real NULL,
 * while the VALUES clause still applies the default on first insert.
 */
export async function upsertDomain(
  env: Env,
  domain: string,
  patch: Partial<Omit<RegistryRow, "domain">> = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO domains (domain, status, platform, origin, account, merchant_name, currency, country,
                          detected_at, last_error, description, logo_url, theme_color, locale, brand_checked_at)
     VALUES (?1, COALESCE(?2, 'active'), COALESCE(?3, 'unknown'), ?4, ?5, ?6, COALESCE(?7, 'BRL'),
             ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
     ON CONFLICT(domain) DO UPDATE SET
       status           = COALESCE(?2,  domains.status),
       platform         = COALESCE(?3,  domains.platform),
       origin           = COALESCE(?4,  domains.origin),
       account          = COALESCE(?5,  domains.account),
       merchant_name    = COALESCE(?6,  domains.merchant_name),
       currency         = COALESCE(?7,  domains.currency),
       country          = COALESCE(?8,  domains.country),
       detected_at      = COALESCE(?9,  domains.detected_at),
       last_error       = ?10,
       description      = COALESCE(?11, domains.description),
       logo_url         = COALESCE(?12, domains.logo_url),
       theme_color      = COALESCE(?13, domains.theme_color),
       locale           = COALESCE(?14, domains.locale),
       brand_checked_at = COALESCE(?15, domains.brand_checked_at)`,
  )
    .bind(
      domain,
      patch.status ?? null,
      patch.platform ?? null,
      patch.origin ?? null,
      patch.account ?? null,
      patch.merchant_name ?? null,
      patch.currency ?? null,
      patch.country ?? null,
      patch.detected_at ?? null,
      patch.last_error ?? null,
      patch.description ?? null,
      patch.logo_url ?? null,
      patch.theme_color ?? null,
      patch.locale ?? null,
      patch.brand_checked_at ?? null,
    )
    .run();
}

/**
 * First-party analytics. The Worker is the collector — no GA, no PostHog.
 * `ua_class` is the metric that decides whether this business exists.
 */
export function track(
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
): void {
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
 * Bucket rather than store the raw UA. Order matters: `Claude-User` must be
 * tested before the broader `claude` alternatives, and bare `Applebot` (which
 * powers Siri web results) is a crawler, not an agent.
 */
export function classifyClient(ua?: string): string {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  if (/gptbot|oai-searchbot|chatgpt-user|chatgpt/.test(u)) return "openai";
  if (/claude-user|claudebot|claude-searchbot|claude-web|anthropic/.test(u)) return "anthropic";
  if (/perplexity/.test(u)) return "perplexity";
  if (/google-extended|googleother|gemini/.test(u)) return "google-ai";
  if (/bytespider|amazonbot|ccbot|applebot|meta-externalagent/.test(u)) return "other-crawler";
  if (/googlebot|bingbot|duckduckbot|yandex|baiduspider/.test(u)) return "search-engine";
  if (/curl|wget|python|node-fetch|axios|go-http|undici|okhttp/.test(u)) return "script";
  if (/mozilla|chrome|safari|firefox/.test(u)) return "browser";
  return "unknown";
}
