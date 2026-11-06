import type { Env } from "../env";
import type { CheckReport } from "./types";
import { RENDER_VERSION, checkCacheKey, normalizeDomain } from "./url";
import { AI_AGENTS, SEARCH_ENGINES } from "./robots";
import { UA } from "../platform/detect";

/**
 * `/check/{domain}`: a deterministic agent-readiness report for any site — what
 * an AI agent can read on its home, is allowed to read by its robots.txt, and
 * can understand from llms.txt, sitemap and JSON-LD. No LLM, no JS rendering.
 *
 * This is NOT a storefront read, so invariant 1's read bound does not describe
 * it; it has its own, stated here and in CLAUDE.md:
 *   - at most 4 upstream resources (home, robots.txt, llms.txt, sitemap), each
 *     with one 6s budget that covers its redirects (3 hops max, every hop
 *     re-validated: https only, public hostname only);
 *   - one extra connection attempt only when `www.` gave no response at all,
 *     because many sites answer on only one of the two hosts;
 *   - per-domain (READ_THROUGH) and per-caller (CALLER_LIMIT) limits, shared
 *     with reads, so a check spends the same budget against a site as a read;
 *   - a report lives 24h (KV with expirationTtl + Cache API), a failed one 10min.
 * It never enumerates: one sitemap URL is fetched to see that it exists, and
 * none of the URLs inside it are followed.
 */

const TIMEOUT = 6_000;
const MAX_REDIRECTS = 3;
/** Enough for any real home page; a sitemap only has to show its root element. */
const MAX_BYTES = 2_000_000;
const SITEMAP_BYTES = 65_536;

/** Reports, not the index: they expire. A home we could not read is retried sooner. */
export const CHECK_TTL = { ok: 86_400, negative: 600 } as const;

/**
 * Bot groups reported for every site. The AI groups are the ones our own
 * robots.txt names; of the search engines, Google and Bing are the indexes
 * assistants search through.
 */
export const BOT_GROUPS: Record<string, string[]> = {
  search_engines: SEARCH_ENGINES.slice(0, 2),
  ...AI_AGENTS,
};
/** Groups whose block costs Permitido points. Training is reported, not scored. */
const SCORED_GROUPS = ["search_engines", "ai_search", "agents"];

const NOT_VERIFIED = [
  "CDN bot protection that only fires for real AI user agents (e.g. Cloudflare 'Block AI bots')",
  "Citado (25 points): whether assistants actually cite this site — that needs asking an assistant, which this deterministic check does not do",
];

// ------------------------------------------------------------------ SSRF guard

/** Private-network suffixes normalizeDomain() does not already reject. */
const PRIVATE_SUFFIX = /\.(?:internal|intranet|lan|home|corp|private|arpa|onion)$/;

/**
 * A hostname we may fetch: a public DNS name. normalizeDomain() already rejects
 * IPs (v4 has a numeric "TLD", v6 is not a label), localhost and the RFC 2606
 * names; this adds the private-network suffixes. Workers cannot reach private
 * address space anyway — this keeps the check from even trying.
 */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  return normalizeDomain(h) !== null && !PRIVATE_SUFFIX.test(h);
}

/** Whatever the caller typed (domain, URL, www.) → a checkable domain, or null. */
export function checkTarget(raw: string): string | null {
  const domain = normalizeDomain(raw);
  return domain && isPublicHost(domain) ? domain : null;
}

// ------------------------------------------------------------------- upstream

interface Got {
  status: number;
  url: string;
  headers: Headers;
  body: string;
}

/** Read at most `max` bytes, then stop: a 50 MB sitemap costs us 64 KB. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = "";
  let n = 0;
  while (n < max) {
    const { done, value } = await reader.read();
    if (done) return out + dec.decode();
    n += value.byteLength;
    out += dec.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return out;
}

/** One resource: redirects followed by hand so every hop passes the guard. */
async function get(start: string, max = MAX_BYTES): Promise<Got> {
  const signal = AbortSignal.timeout(TIMEOUT);
  let url = start;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = new URL(url);
      if (u.protocol !== "https:" || !isPublicHost(u.hostname)) break;
      const res = await fetch(u.toString(), {
        headers: { "user-agent": UA, accept: "text/html,text/plain,*/*" },
        redirect: "manual",
        signal,
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        url = new URL(location, u).toString();
        continue;
      }
      if (!res.ok) await res.body?.cancel();
      return { status: res.status, url, headers: res.headers, body: res.ok ? await readCapped(res, max) : "" };
    }
  } catch {
    // Timeout, DNS, TLS: no answer, reported as status 0.
  }
  return { status: 0, url, headers: new Headers(), body: "" };
}

// ---------------------------------------------------------------- robots.txt

interface Robots {
  groups: { agents: string[]; rules: { key: "allow" | "disallow"; val: string }[] }[];
  sitemaps: string[];
}

export function parseRobots(txt: string): Robots {
  const groups: Robots["groups"] = [];
  let cur: Robots["groups"][number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const m = raw.replace(/#.*/, "").trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === "user-agent") {
      if (!lastWasAgent || !cur) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === "allow" || key === "disallow")) cur.rules.push({ key, val });
    }
  }
  // Only absolute URLs: `Sitemap: none` is a real line in the wild (ours, even).
  const sitemaps = [...txt.matchAll(/^\s*sitemap\s*:\s*(https?:\/\/\S+)/gim)].map((m) => m[1]!);
  return { groups, sitemaps };
}

function ruleMatches(pattern: string, path: string): boolean {
  if (!pattern) return false; // an empty Disallow allows everything
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

/**
 * RFC 9309: the groups naming the bot (merged, as the RFC says), else the `*`
 * groups; within them the longest matching rule wins and a tie goes to Allow.
 * Only the home ("/") is asked about — the question is whether an agent may
 * read the site at all, not a per-path audit.
 */
export function isBlocked(robots: Robots, bot: string, path = "/"): boolean {
  const b = bot.toLowerCase();
  const named = robots.groups.filter((g) => g.agents.some((a) => a !== "*" && b.includes(a)));
  const groups = named.length ? named : robots.groups.filter((g) => g.agents.includes("*"));
  let best: { key: string; val: string } | null = null;
  for (const r of groups.flatMap((g) => g.rules)) {
    if (!ruleMatches(r.val, path)) continue;
    if (!best || r.val.length > best.val.length || (r.val.length === best.val.length && r.key === "allow")) best = r;
  }
  return best?.key === "disallow";
}

// ---------------------------------------------------------------------- HTML

/** Third-party text that ends up in a document a model reads: one line, capped. */
const oneLine = (s: string, max = 300) => s.replace(/\s+/g, " ").trim().slice(0, max);

function meta(html: string, name: string): string {
  return (
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i"))?.[1] ??
    ""
  );
}

export function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function jsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === "object") {
      const t = (n as Record<string, unknown>)["@type"];
      for (const x of ([] as unknown[]).concat(t ?? [])) types.add(oneLine(String(x), 80));
      Object.values(n).forEach(walk);
    }
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1]!));
    } catch {
      types.add("(invalid JSON-LD)");
    }
  }
  return [...types].slice(0, 30);
}

// -------------------------------------------------------------------- report

/** Run the check against the live site. Bounded as described at the top. */
export async function checkSite(domain: string): Promise<CheckReport> {
  // www first, like every other read here; the apex only if www never answered.
  let home = await get(`https://www.${domain}/`);
  if (home.status === 0) home = await get(`https://${domain}/`);
  const origin = new URL(home.url).origin;

  const [robotsRes, llms] = await Promise.all([get(`${origin}/robots.txt`), get(`${origin}/llms.txt`)]);
  const robots = parseRobots(robotsRes.body);
  const sitemapUrl = robots.sitemaps[0] ?? `${origin}/sitemap.xml`;
  const sitemap = await get(sitemapUrl, SITEMAP_BYTES);

  const html = home.body;
  const text = textOf(html);
  const title = oneLine(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = oneLine(meta(html, "description"));
  const robotsMeta = `${meta(html, "robots")} ${home.headers.get("x-robots-tag") ?? ""}`.toLowerCase();
  const types = jsonLdTypes(html);
  const llmsText = llms.status === 200 && !/<html/i.test(llms.body.slice(0, 500)) ? llms.body : "";

  const blocked = Object.fromEntries(
    Object.entries(BOT_GROUPS).map(([g, bots]) => [g, bots.filter((b) => isBlocked(robots, b))]),
  );

  const homeRead = home.status === 200;
  const legivel = {
    home_responds: homeRead,
    title_and_meta: title.length > 0 && description.length > 0,
    price_in_text: /R\$\s?\d|US?\$\s?\d|€\s?\d|\d+[.,]\d{2}\s?(?:\/m[eê]s|por m[eê]s)/i.test(text),
    faq: /faq|perguntas frequentes|d[uú]vidas/i.test(text) || types.includes("FAQPage"),
    text_without_js:
      homeRead &&
      text.length >= 500 &&
      !/enable javascript|habilite o javascript|ative o javascript/i.test(text.slice(0, 2000)),
  };
  const entendivel = {
    llms_txt: llmsText.length > 0,
    llms_txt_links_pricing: /\]\([^)]*\/(?:pricing|precos|pre%C3%A7os|preços|planos|plans)\b/i.test(llmsText),
    sitemap: sitemap.status === 200 && /<(urlset|sitemapindex)/i.test(sitemap.body),
    json_ld_home: types.length > 0,
    software_or_product: types.some((t) => /SoftwareApplication|WebApplication|Product/.test(t)),
  };
  const blockedGroups = SCORED_GROUPS.filter((g) => blocked[g]!.length > 0);
  const noindex = /noindex/.test(robotsMeta);

  const score = (o: Record<string, boolean>) => Object.values(o).filter(Boolean).length * 5;
  const pillars = {
    legivel: score(legivel),
    // -3: CDN bot protection is not verifiable from here, so it is never full marks.
    permitido: Math.max(0, 25 - 8 * blockedGroups.length - (noindex ? 25 : 0) - 3),
    entendivel: score(entendivel),
  };

  return {
    domain,
    checked_at: new Date().toISOString(),
    home: {
      status: home.status,
      final_url: home.url,
      html_bytes: html.length,
      text_chars: text.length,
      title,
      description,
    },
    robots: { status: robotsRes.status, blocked, noindex, sitemaps: robots.sitemaps.slice(0, 5) },
    llms_txt: { status: llms.status, bytes: llmsText.length },
    sitemap: { url: sitemapUrl, status: sitemap.status },
    json_ld_types: types,
    legivel,
    entendivel,
    pillars,
    subtotal: pillars.legivel + pillars.permitido + pillars.entendivel,
    not_verified: NOT_VERIFIED,
  };
}

/** How long a report may be served: a full day, unless the home did not answer. */
export const checkTtl = (r: CheckReport) => (r.home.status === 200 ? CHECK_TTL.ok : CHECK_TTL.negative);

export interface CheckResult {
  /** null: refused by a rate limit before any upstream call. */
  report: CheckReport | null;
  cache: "edge" | "kv" | "miss";
}

/**
 * The one entry point for `/check/{domain}[.json]` and the `check_site` tool:
 * Cache API → KV → live check. The Cache API key is built by hand because POST
 * (the MCP tool) is never cached by it, so the route and the tool share one entry.
 */
export async function checkThrough(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  domain: string,
  caller?: string,
): Promise<CheckResult> {
  const cacheReq = new Request(checkCacheKey(env.PUBLIC_ORIGIN, domain), { method: "GET" });
  const hit = await caches.default.match(cacheReq);
  if (hit) return { report: (await hit.json()) as CheckReport, cache: "edge" };

  const kvKey = `check:${domain}:v${RENDER_VERSION}`;
  const stored = await env.CACHE.get<CheckReport>(kvKey, "json");
  if (stored) {
    const left = checkTtl(stored) - (Date.now() - Date.parse(stored.checked_at)) / 1000;
    if (left > 60) ctx.waitUntil(caches.default.put(cacheReq, edgeEntry(stored, Math.floor(left))));
    return { report: stored, cache: "kv" };
  }

  // Cold: the same two budgets a read spends. A refusal is never cached.
  if (caller && env.CALLER_LIMIT && !(await env.CALLER_LIMIT.limit({ key: caller })).success) {
    return { report: null, cache: "miss" };
  }
  if (env.READ_THROUGH && !(await env.READ_THROUGH.limit({ key: domain })).success) {
    return { report: null, cache: "miss" };
  }

  const report = await checkSite(domain);
  const ttl = checkTtl(report);
  ctx.waitUntil(env.CACHE.put(kvKey, JSON.stringify(report), { expirationTtl: ttl }));
  ctx.waitUntil(caches.default.put(cacheReq, edgeEntry(report, ttl)));
  return { report, cache: "miss" };
}

const edgeEntry = (r: CheckReport, ttl: number) =>
  new Response(JSON.stringify(r), {
    headers: { "content-type": "application/json", "cache-control": `public, s-maxage=${ttl}` },
  });
