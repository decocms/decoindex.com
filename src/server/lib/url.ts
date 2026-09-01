/**
 * decoindex.com/{domain}/{...path}[.md|.json]
 *
 * The domain segment is the primary key of the whole service. Everything
 * downstream (DO id, cache key, R2 prefix) derives from the normalized form,
 * so normalize once, here, and never again.
 */

export type Ext = "md" | "json";

/**
 * A filename is not a domain, but it looks exactly like one to a naive pattern:
 * `favicon.ico`, `config.js` and `tracking.php` all read as `label.tld`. Browsers
 * ask for the first; vulnerability scanners spray the rest at every public host.
 * Left unguarded we resolve `https://www.config.js`, burn a detection handshake
 * and write a cache entry, once per probe.
 *
 * Only the *last* label is checked, and only against suffixes that are not real
 * TLDs. `.sh`, `.zip`, `.dev` and `.app` are deliberately absent: those are real
 * and a merchant could be on one.
 */
const NOT_A_TLD = new Set([
  // Reserved by RFC 2606 / 6761 — never resolvable.
  "example", "invalid", "localhost", "test", "local",
  // File extensions scanners and browsers probe for.
  "env", "js", "mjs", "cjs", "ts", "json", "php", "asp", "aspx", "jsp", "cgi",
  "py", "rb", "pl", "sql", "bak", "log", "conf", "ini", "cfg", "yml", "yaml",
  "toml", "lock", "txt", "xml", "csv", "md", "html", "htm", "css", "map",
  "ico", "png", "jpg", "jpeg", "gif", "svg", "webp", "woff", "woff2", "webmanifest",
]);

/** One DNS label: alphanumeric, inner hyphens allowed, 1–63 chars. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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
  // candidateOrigins() below puts it back when we actually fetch.
  d = d.replace(/^www\./, "");

  const labels = d.split(".");
  // At least one label plus a TLD, and every label well-formed. Checking each
  // label rejects a leading dot (`.env.local` splits to an empty first label),
  // which the old single-regex form happily accepted.
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;

  const tld = labels[labels.length - 1]!;
  if (tld.length < 2 || !/^[a-z]+$/.test(tld) || NOT_A_TLD.has(tld)) return null;
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
const SIGNIFICANT = ["page", "sort", "q"];

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

/**
 * Bump when a renderer changes shape — or when the same shape would now be
 * filled with different content. Reordering a listing is the second kind: the
 * template is untouched, every cached document is still wrong, and the ordering
 * fix looked deployed while the edge served yesterday's row order for a day. The edge cache has no purge from inside a
 * Worker and a document TTL is a day, so without this a template fix is
 * invisible until it expires. It only ever appears in the synthetic cache key,
 * never in a URL we serve or publish.
 */
export const RENDER_VERSION = "17";

/** Cache key: stable, ext-aware, query-normalized. */
export function cacheKey(
  origin: string,
  domain: string,
  path: string,
  ext: Ext,
  query?: URLSearchParams,
): string {
  const q = normalizedQuery(query);
  const suffix = `${q ? `?${q}&` : "?"}v=${RENDER_VERSION}`;
  return `${origin}/${domain}${path}${ext === "md" ? "" : `.${ext}`}${suffix}`;
}
