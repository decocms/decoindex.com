import type { Env } from "../env";
import type { Doc, Storefront } from "../lib/types";
import { RENDER_VERSION, cacheKey, canonicalUrl, normalizedQuery, type Ext } from "./url";
import { getDomain, upsertDomain } from "./registry";
import { docKey, isStale, readDoc, writeDoc, type StoredDoc } from "./store";
import { detectPlatform, resolve } from "../platform";
import { fetchBrand } from "../platform/brand";
import { vtexApiOrigin } from "../platform/vtex";
import {
  renderHome,
  renderListing,
  renderProblem,
  renderProduct,
  type RenderCtx,
} from "../render/markdown";

/**
 * The read path, in one place, so that everything which serves a document goes
 * through the same three layers in the same order.
 *
 * This used to live inside the `GET *` handler in main.ts. It moved here the
 * moment `/mcp` grew public tools, because the alternative was a second
 * implementation of the same read — and a tool call that resolves a storefront
 * URL *is* a read, subject to every invariant in CLAUDE.md. Sharing the code is
 * what makes that true rather than aspirational: one rate limiter, one cache
 * key, one registry write, one event.
 */

/**
 * Every markdown document is served as text/plain, deliberately.
 *
 * `text/markdown` is the honest label and, in practice, the unreadable one:
 * ChatGPT's browser rejects it outright — "unsupported content-type" — then
 * reports decoindex as broken and scrapes the merchant instead.
 *
 * Negotiating per Accept was the obvious fix and it does not survive contact
 * with the edge: Cloudflare's zone cache ignores `Vary`, so within the shared
 * cache window whichever content type happened to be stored first is served to
 * everyone. One type, always, is the only version that is correct at every
 * cache layer — and the bytes are identical either way.
 */
export const MARKDOWN_TYPE = "text/plain; charset=utf-8";

export const TTL = {
  product: { browser: 300, edge: 86_400 },
  listing: { browser: 120, edge: 21_600 },
  home: { browser: 300, edge: 86_400 },
  llms: { browser: 300, edge: 86_400 },
  problem: { browser: 0, edge: 60 },
} as const;

/** Which TTL bucket a path falls in, and the `surface` dimension on events. */
export function classifySurface(path: string): string {
  if (path === "/") return "home";
  if (path === "/llms.txt") return "llms";
  if (/\/p\/?$/.test(path) || /\/products\/[^/]+\/?$/.test(path)) return "product";
  return "listing";
}

export interface ReadResult {
  /** The document. What an MCP tool reads. */
  doc: StoredDoc;
  /** Ready to return to an HTTP caller, headers and all. */
  response: Response;
  /** Which layer answered. Only for the event log — never changes the bytes. */
  cache: "edge" | "kv" | "miss";
}

/**
 * Resolve one URL to a document through edge cache -> KV -> upstream, and own
 * the cache-write policy while doing it. Every caller gets both shapes: the
 * `Response` for HTTP, the `doc` for a tool call.
 *
 * `ctx` is the execution context: KV writes, cache puts and stale refreshes all
 * happen after the response, never in the caller's critical path.
 */
export async function readThrough(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  domain: string,
  path: string,
  ext: Ext,
  query: URLSearchParams,
  rctx: RenderCtx,
): Promise<ReadResult> {
  const surface = classifySurface(path);

  // Layer 1: the edge cache, per colo. Free and fastest.
  //
  // The key is built by hand rather than from the incoming Request because the
  // Cache API never caches POST — without this, an MCP tool call would miss on
  // every invocation while its REST twin sat in cache. Same key, one entry.
  const cache = caches.default;
  const cacheReq = new Request(cacheKey(env.PUBLIC_ORIGIN, domain, path, ext, query), { method: "GET" });
  const hit = await cache.match(cacheReq);
  if (hit) {
    return {
      cache: "edge",
      response: hit.clone(),
      doc: {
        body: await hit.clone().text(),
        status: hit.status,
        contentType: hit.headers.get("content-type") ?? MARKDOWN_TYPE,
        canonical:
          /<([^>]+)>; rel="canonical"/.exec(hit.headers.get("link") ?? "")?.[1] ??
          `https://${domain}${path}`,
        renderedAt: hit.headers.get("x-decoindex-rendered-at") ?? new Date().toISOString(),
        renderVersion: RENDER_VERSION,
      },
    };
  }

  // Layer 2: KV — the persistent index. Serve stale, refresh behind the reader.
  const kvKey = docKey(domain, path, normalizedQuery(query)) + (ext === "md" ? "" : `.${ext}`);
  const stored = await readDoc(env, kvKey);
  if (stored) {
    const stale = isStale(stored, surface);
    if (stale) {
      ctx.waitUntil(
        build(env, domain, path, ext, query, rctx)
          .then((fresh) => writeDoc(env, kvKey, fresh))
          .catch(() => {}),
      );
    }
    const response = toResponse(stored, surface, env.PUBLIC_ORIGIN);
    // Deliberately do NOT cache a stale body. It is fine to hand this reader an
    // old document while the refresh runs behind them, but writing it to the
    // edge pins it there for the full TTL — and because the cache key carries
    // RENDER_VERSION, a template change would re-pin the *old* render under the
    // *new* key and stay wrong for a day. Cache only what came back fresh.
    if (stored.status === 200 && !stale) ctx.waitUntil(cache.put(cacheReq, response.clone()));
    return { doc: stored, cache: "kv", response };
  }

  // Layer 3: resolve it live, once.
  const fresh = await build(env, domain, path, ext, query, rctx);
  const response = toResponse(fresh, surface, env.PUBLIC_ORIGIN);
  ctx.waitUntil(writeDoc(env, kvKey, fresh));
  if (fresh.status === 200) ctx.waitUntil(cache.put(cacheReq, response.clone()));
  return { doc: fresh, cache: "miss", response };
}

export function toResponse(doc: StoredDoc, surface: string, origin: string): Response {
  const ttl = doc.status === 200 ? (TTL[surface as keyof typeof TTL] ?? TTL.product) : TTL.problem;
  if (doc.redirectTo) {
    return new Response(null, {
      status: doc.status,
      headers: { location: doc.redirectTo, "cache-control": "public, max-age=3600" },
    });
  }
  return new Response(doc.body, {
    status: doc.status,
    headers: {
      // Documents stored before the switch still carry `text/markdown`; correct
      // it here rather than waiting for every one of them to re-render.
      "content-type": doc.contentType.startsWith("text/markdown") ? MARKDOWN_TYPE : doc.contentType,
      "cache-control": `public, max-age=${ttl.browser}, s-maxage=${ttl.edge}`,
      // Invariant 3: a mirror, not a competitor for the merchant's SEO — but
      // only `noindex`. `nofollow` was also telling every crawler not to follow
      // the links on the page, and every link here points at the merchant. It
      // suppressed exactly the traffic this service exists to send them.
      "x-robots-tag": "noindex",
      "access-control-allow-origin": "*",
      link: [
        `<${doc.canonical}>; rel="canonical"`,
        `<${origin}/llms.txt>; rel="llms-txt"; type="text/plain"`,
      ].join(", "),
      "x-decoindex-rendered-at": doc.renderedAt,
    },
  });
}

/**
 * Resolve one URL into a stored document. This is the only place in the read
 * path that touches a merchant, and it is bounded: one detection handshake per
 * domain ever, then at most two API calls per document.
 */
export async function build(
  env: Env,
  domain: string,
  path: string,
  ext: Ext,
  query: URLSearchParams,
  rctx: RenderCtx,
): Promise<StoredDoc> {
  const problem = (kind: Parameters<typeof renderProblem>[2], status: number): StoredDoc => ({
    body: renderProblem(domain, path, kind, rctx),
    status,
    contentType: MARKDOWN_TYPE,
    canonical: `https://${domain}${path}`,
    renderedAt: new Date().toISOString(),
    renderVersion: RENDER_VERSION,
  });

  let row = await getDomain(env, domain);

  if (row?.status === "opted-out") return problem("opted-out", 404);
  if (row?.status === "unsupported") return problem("unsupported", 415);
  if (row?.status === "blocked") return problem("blocked", 502);

  // Nobody gets to use us as an amplifier against a storefront. Cached reads are
  // never limited — this only gates URLs we have never resolved.
  if (env.READ_THROUGH) {
    const { success } = await env.READ_THROUGH.limit({ key: domain });
    if (!success) return problem("rate-limited", 429);
  }

  if (!row) {
    const found = await detectPlatform(domain);

    // Only a domain we can actually read earns a registry row. A failed
    // detection is remembered by the negative KV entry instead, which expires —
    // so a merchant who lifts a block, or migrates onto a supported platform,
    // starts working on its own instead of being wrong here forever.
    if (found.platform === "unknown") {
      return found.blocked ? problem("blocked", 502) : problem("unsupported", 415);
    }

    await upsertDomain(env, domain, {
      status: "active",
      platform: found.platform,
      origin: found.origin,
      account: found.account ?? null,
      merchant_name: found.merchantName ?? null,
      currency: found.currency,
      country: found.country ?? null,
      detected_at: new Date().toISOString(),
    });
    row = await getDomain(env, domain);
  }
  if (!row) return problem("unsupported", 415);

  const shop: Storefront = {
    domain,
    platform: row.platform,
    origin: row.origin ?? `https://www.${domain}`,
    name: row.merchant_name ?? undefined,
    account: row.account ?? undefined,
    currency: row.currency,
    country: row.country ?? undefined,
    description: row.description ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    themeColor: row.theme_color ?? undefined,
    locale: row.locale ?? undefined,
    claimed: Boolean(row.claimed_at),
  };
  // VTEX answers on a canonical host that a custom storefront cannot intercept.
  if (shop.platform === "vtex") {
    shop.apiOrigin = vtexApiOrigin(row.account ?? undefined, shop.origin);
  }

  // A catalog with no brand is a spreadsheet. The overview and the machine index
  // are the two surfaces where "who is this merchant" is the actual question, so
  // they pay for one homepage read — once per domain, then it lives in D1 and
  // every other surface gets the name for free.
  if ((path === "/" || path === "/llms.txt") && !row.brand_checked_at) {
    const brand = await fetchBrand(shop.origin);
    if (brand) {
      shop.name ??= brand.name;
      shop.description = brand.description;
      shop.logoUrl = brand.image;
      shop.themeColor = brand.themeColor;
      shop.locale = brand.locale;
    }
    await upsertDomain(env, domain, {
      merchant_name: brand?.name ?? null,
      description: brand?.description ?? null,
      logo_url: brand?.image ?? null,
      theme_color: brand?.themeColor ?? null,
      locale: brand?.locale ?? null,
      brand_checked_at: new Date().toISOString(),
    });
  }

  /**
   * `/{domain}/llms.txt` used to render a second, thinner index. It was a
   * duplicate of the overview with fewer facts, and pointing agents at it cost
   * us a real reader: ChatGPT followed our own advice to that path, could not
   * read it, and concluded the service was broken — while `/{domain}` had been
   * working the whole time.
   *
   * One index per storefront. Anything that still asks for the old path is sent
   * to it rather than given a 404.
   */
  if (path === "/llms.txt") {
    return {
      body: "",
      status: 308,
      contentType: MARKDOWN_TYPE,
      canonical: `${rctx.publicOrigin}/${domain}`,
      redirectTo: `${rctx.publicOrigin}/${domain}`,
      renderedAt: new Date().toISOString(),
      renderVersion: RENDER_VERSION,
    };
  }

  const doc = await resolve(env, shop, path, query);
  if (doc.kind === "upstream_error") return problem("upstream", 502);
  if (doc.kind === "notfound") return problem("notfound", 404);

  return {
    body: ext === "json" ? JSON.stringify({ shop, ...doc }, null, 2) : renderMarkdown(shop, doc, path, rctx, query),
    status: 200,
    contentType: ext === "json" ? "application/json; charset=utf-8" : MARKDOWN_TYPE,
    canonical:
      doc.kind === "product"
        ? canonicalUrl(domain, doc.product.slug, rctx.attribution)
        // A search canonical without the term points at an empty search box.
        : canonicalUrl(
            domain,
            path + (normalizedQuery(query) ? `?${normalizedQuery(query)}` : ""),
            rctx.attribution,
          ),
    renderedAt: new Date().toISOString(),
    renderVersion: RENDER_VERSION,
  };
}

function renderMarkdown(
  shop: Storefront,
  doc: Doc,
  path: string,
  rctx: RenderCtx,
  query?: URLSearchParams,
): string {
  switch (doc.kind) {
    case "product":
      return renderProduct(shop, doc.product, rctx);
    case "listing":
      return renderListing(shop, doc, path, rctx, normalizedQuery(query));
    case "home":
      return renderHome(
        shop,
        doc.categories,
        rctx,
        doc.totalCategories,
        doc.popular,
        doc.popularBasis,
        doc.topSearches,
      );
    case "upstream_error":
      return renderProblem(shop.domain, path, "upstream", rctx);
    default:
      return renderProblem(shop.domain, path, "notfound", rctx);
  }
}
