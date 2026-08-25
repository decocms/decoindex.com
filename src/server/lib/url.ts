/**
 * decoindex.com/{domain}/{...path}[.md|.json]
 *
 * The domain segment is the primary key of the whole service. Everything
 * downstream (DO id, cache key, R2 prefix) derives from the normalized form,
 * so normalize once, here, and never again.
 */

export type Ext = "md" | "json" | "html";

export interface ParsedRequest {
  domain: string; // normalized: lowercase, no scheme, no leading www, no port
  path: string; // canonical path on the merchant site, always leading "/"
  ext: Ext;
}

const EXT_RE = /\.(md|json)$/i;

export function normalizeDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  if (!d) return null;
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

/** Cache key: stable, ext-aware, query-normalized (sorted, whitelisted). */
export function cacheKey(
  origin: string,
  domain: string,
  path: string,
  ext: Ext,
  query?: URLSearchParams,
  allow: string[] = ["q", "page", "limit"],
): string {
  const u = new URL(`${origin}/${domain}${path}`);
  if (query) {
    const keys = allow.filter((k) => query.get(k)).sort();
    for (const k of keys) u.searchParams.set(k, query.get(k)!.trim().toLowerCase());
  }
  return u.toString() + (ext === "md" ? "" : `.${ext}`);
}
