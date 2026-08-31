/**
 * decoindex.com/{domain}/{...path}[.md|.json]
 *
 * The domain segment is the primary key of the whole service. Everything
 * downstream (DO id, cache key, R2 prefix) derives from the normalized form,
 * so normalize once, here, and never again.
 */

export type Ext = "md" | "json";

/**
 * Things a browser asks for at the root that look like a domain to the regex
 * below (`favicon.ico` matches `name.tld`). Without this guard they fall through
 * to the catch-all and we go fetch `https://www.favicon.ico`.
 */
const NOT_A_DOMAIN = new Set([
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "apple-touch-icon.png",
  "site.webmanifest",
  "ads.txt",
  "security.txt",
]);

export interface ParsedRequest {
  domain: string; // normalized: lowercase, no scheme, no leading www, no port
  path: string; // canonical path on the merchant site, always leading "/"
  ext: Ext;
}

const EXT_RE = /\.(md|json)$/i;

export function normalizeDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  if (!d || NOT_A_DOMAIN.has(d)) return null;
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0]!;
  d = d.split("@").pop()!; // strip any userinfo
  d = d.split(":")[0]!; // strip port
  // Keep www out of the key, but remember: some storefronts only answer on www.
  // resolveOrigin() below puts it back when we actually fetch.
  d = d.replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  if (d.includes("..")) return null;
  return d;
}

/** Split "/farmrio.com.br/vestido/p.md" into its parts. */
export function parsePath(pathname: string): ParsedRequest | null {
  const clean = pathname.replace(/^\/+/, "");
  if (!clean) return null;
  const slash = clean.indexOf("/");
  const rawDomain = slash === -1 ? clean : clean.slice(0, slash);
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;

  let rest = slash === -1 ? "" : clean.slice(slash + 1);
  let ext: Ext = "md"; // markdown is the default representation for agents
  const m = rest.match(EXT_RE);
  if (m) {
    ext = m[1]!.toLowerCase() as Ext;
    rest = rest.slice(0, -m[0].length);
  }
  return { domain, path: "/" + rest, ext };
}

/**
 * Merchant origin to fetch from. Many BR storefronts 301 apex -> www and a few
 * only serve www, so we try www first and let the caller fall back.
 */
export function candidateOrigins(domain: string): string[] {
  return [`https://www.${domain}`, `https://${domain}`];
}

/** Absolute canonical URL on the merchant's own site, with attribution. */
export function canonicalUrl(
  domain: string,
  path: string,
  attribution?: { param: string; value: string },
): string {
  const u = new URL(path, `https://www.${domain}`);
  if (attribution) u.searchParams.set(attribution.param, attribution.value);
  return u.toString();
}

/**
 * Only these params change the answer. Everything else (utm_*, gclid, VTEX's own
 * tracking) is dropped, so a hundred decorated variants of one URL share a single
 * index entry instead of a hundred.
 */
const SIGNIFICANT = ["page"];

/** Canonical, sorted query string. Shared by the edge cache key and the KV key. */
export function normalizedQuery(query?: URLSearchParams): string {
  if (!query) return "";
  const out = new URLSearchParams();
  for (const k of SIGNIFICANT) {
    const v = query.get(k)?.trim().toLowerCase();
    if (v) out.set(k, v);
  }
  return out.toString();
}

/** Cache key: stable, ext-aware, query-normalized. */
export function cacheKey(
  origin: string,
  domain: string,
  path: string,
  ext: Ext,
  query?: URLSearchParams,
): string {
  const q = normalizedQuery(query);
  return `${origin}/${domain}${path}${ext === "md" ? "" : `.${ext}`}${q ? `?${q}` : ""}`;
}
