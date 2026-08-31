import { Hono } from "hono";
import type { Env } from "./env";
import type { Doc, Storefront } from "./lib/types";
import { cacheKey, canonicalUrl, normalizedQuery, parsePath, type Ext } from "./lib/url";
import { getDomain, track, upsertDomain } from "./lib/registry";
import { docKey, isStale, readDoc, writeDoc, type StoredDoc } from "./lib/store";
import { detectPlatform, resolve } from "./platform";
import { fetchBrand } from "./platform/brand";
import {
  renderHome,
  renderListing,
  renderLlmsTxt,
  renderProblem,
  renderProduct,
  type RenderCtx,
} from "./render/markdown";
import { SAMPLE, landingHtml } from "./render/landing";
// Imported as bytes via the "Data" rule in wrangler.jsonc.
import ogImage from "../../assets/og.png";

type Ctx = { Bindings: Env };
const app = new Hono<Ctx>();

/**
 * Reads are bounded, and never crawl.
 *
 * A request is answered from the edge cache, from KV, or by resolving *that one
 * URL* against the merchant's public platform API — at most two upstream calls,
 * a 6s timeout, rate-limited per domain, and negative-cached. A read never
 * enumerates a catalog and never renders HTML.
 *
 * The KV write is what makes this an index rather than a cache: a URL that was
 * ever asked for stays answerable, and costs us nothing the second time.
 */
const TTL = {
  product: { browser: 300, edge: 86_400 },
  listing: { browser: 120, edge: 21_600 },
  home: { browser: 300, edge: 86_400 },
  llms: { browser: 300, edge: 86_400 },
  problem: { browser: 0, edge: 60 },
} as const;

app.get("/healthz", (c) => c.text("ok"));

/**
 * The comparison on the landing page shows the real current document, read out
 * of our own KV — never fetched from the merchant, so the landing page stays
 * within invariant 1 and costs one KV read.
 */
app.get("/", async (c) => {
  const stored = await readDoc(c.env, docKey(SAMPLE.domain, SAMPLE.path, "")).catch(() => null);
  const body = landingHtml(c.env.PUBLIC_ORIGIN, stored?.status === 200 ? stored.body : null);
  // Warm the sample on the first ever request so the next visitor sees it.
  if (!stored) {
    c.executionCtx.waitUntil(
      fetch(`${new URL(c.req.url).origin}/${SAMPLE.domain}${SAMPLE.path}`).then(() => {}, () => {}),
    );
  }
  return c.html(body);
});

/** Social preview. Immutable: regenerating it is a deploy, so cache it hard. */
app.get("/og.png", () =>
  new Response(ogImage, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600, s-maxage=604800, immutable",
    },
  }),
);

app.get("/robots.txt", (c) =>
  c.text(
    [
      // Invariant 3: we are a channel, not a competitor. Search engines get our
      // own pages and nothing else — the day a decoindex mirror outranks a
      // merchant's own PDP is the day the commercial conversation ends.
      // Everything under /{domain}/ is a mirror; the handful of paths above it
      // are ours to be found by. AI agents are unrestricted; they are the point.
      "User-agent: Googlebot",
      "User-agent: bingbot",
      "User-agent: DuckDuckBot",
      "User-agent: Yandex",
      "User-agent: Baiduspider",
      "Allow: /$",
      "Allow: /about",
      "Allow: /opt-out",
      "Allow: /llms.txt",
      "Allow: /og.png",
      "Disallow: /",
      "",
      "User-agent: *",
      "Allow: /",
      "",
      `Sitemap: none — this service is resolved on demand, not enumerable.`,
      `# Machine index: ${c.env.PUBLIC_ORIGIN}/llms.txt`,
    ].join("\n"),
  ),
);

app.get("/llms.txt", (c) =>
  c.text(
    [
      "# decoindex",
      "",
      "> Agent-readable mirrors of ecommerce storefronts. Swap the origin of any VTEX or",
      "> Shopify storefront URL for `decoindex.com/{domain}` and get normalized Markdown",
      "> instead of client-rendered HTML. Resolved on demand from the merchant's own",
      "> public API — no crawl, no waiting, works on the first request.",
      "",
      "## Usage",
      "",
      "```",
      "https://www.farmrio.com.br/vestido-longo-123/p",
      `${c.env.PUBLIC_ORIGIN}/farmrio.com.br/vestido-longo-123/p`,
      "```",
      "",
      "- Append `.json` to any path for the same document as structured JSON.",
      "- `/{domain}/` is the storefront overview: categories and URL conventions.",
      "- `/{domain}/llms.txt` is the per-storefront machine index.",
      "- Listings paginate with `?page=N`.",
      "",
      "## What is and is not published",
      "",
      "- Published: title, brand, attributes, variants, categories, observed price,",
      "  observed availability, and a cart link on the merchant's own checkout.",
      "- Not published: live stock, final price after promotions, delivery dates,",
      "  personalized offers. Verify these with the merchant before promising anything.",
      "",
      "## Notes",
      "",
      "- Supported platforms: VTEX, Shopify.",
      "- The merchant's own site is always canonical; every response says so.",
      `- Merchants: ${c.env.PUBLIC_ORIGIN}/opt-out`,
    ].join("\n"),
  ),
);

app.get("/about", (c) =>
  c.text(
    [
      "decoindex — agent-readable mirrors of ecommerce storefronts.",
      "",
      "Swap any VTEX or Shopify storefront URL's origin for decoindex.com/<domain>/<path>",
      "and get normalized catalog facts as Markdown or JSON, with provenance and a stated",
      "freshness boundary. Catalog facts only: stock, final price and delivery must be",
      "verified with the merchant.",
      "",
      "We read the merchant's own public catalog API — the same endpoints their storefront",
      "uses. We do not scrape HTML, never rehost images, mark every mirrored page noindex,",
      "point rel=canonical at the merchant, and carry attribution on every outbound link.",
      "",
      "We identify ourselves in every request as:",
      "  decoindex/1.0 (+https://decoindex.com/about)",
      "",
      "Merchants: claim your domain or opt out at /opt-out.",
      "Built by deco (https://decocms.com).",
    ].join("\n"),
  ),
);

app.get("/opt-out", (c) =>
  c.text(
    [
      "To remove a domain from decoindex, email opt-out@decoindex.com from an address on",
      "that domain. Removal is honoured within 24h and the domain is never re-mirrored",
      "without an explicit request from the merchant.",
      "",
      "You can also block us at the edge: we identify ourselves as `decoindex` in the",
      "User-Agent of every request and we do not work around blocks.",
    ].join("\n"),
  ),
);

/** Client-side beacon for the landing page. Cookieless. */
app.post("/e", async (c) => {
  const body = await c.req
    .json<{ name?: string; meta?: Record<string, unknown> }>()
    .catch(() => null);
  if (body?.name) {
    track(c.env, c.executionCtx, {
      name: body.name,
      surface: "landing",
      ua: c.req.header("user-agent"),
      country: (c.req.raw.cf?.country as string) ?? undefined,
      meta: body.meta,
    });
  }
  return c.body(null, 204);
});

/** Everything else is /{domain}/... */
app.get("*", async (c) => {
  const started = Date.now();
  const url = new URL(c.req.url);
  const parsed = parsePath(url.pathname);
  if (!parsed) return c.notFound();

  const { domain, path, ext } = parsed;
  const surface = classifySurface(path);
  const rctx: RenderCtx = {
    publicOrigin: c.env.PUBLIC_ORIGIN,
    attribution: { param: c.env.ATTRIBUTION_PARAM, value: c.env.ATTRIBUTION_VALUE },
  };

  // Layer 1: the edge cache, per colo. Free and fastest.
  const key = cacheKey(c.env.PUBLIC_ORIGIN, domain, path, ext, url.searchParams);
  const cache = caches.default;
  const cacheReq = new Request(key, { method: "GET" });
  const hit = await cache.match(cacheReq);
  if (hit) {
    logRead(c.env, c.executionCtx, c.req.raw, { domain, surface, started, cache: "edge", ext, status: hit.status });
    return hit;
  }

  // Layer 2: KV — the persistent index. Serve stale, refresh behind the reader.
  const kvKey = docKey(domain, path, normalizedQuery(url.searchParams)) + (ext === "md" ? "" : `.${ext}`);
  const stored = await readDoc(c.env, kvKey);
  if (stored) {
    if (isStale(stored, surface)) {
      c.executionCtx.waitUntil(
        build(c.env, domain, path, ext, url.searchParams, rctx)
          .then((fresh) => writeDoc(c.env, kvKey, fresh))
          .catch(() => {}),
      );
    }
    const res = toResponse(stored, surface);
    if (stored.status === 200) c.executionCtx.waitUntil(cache.put(cacheReq, res.clone()));
    logRead(c.env, c.executionCtx, c.req.raw, { domain, surface, started, cache: "kv", ext, status: stored.status });
    return res;
  }

  // Layer 3: resolve it live, once.
  const fresh = await build(c.env, domain, path, ext, url.searchParams, rctx);
  const res = toResponse(fresh, surface);
  c.executionCtx.waitUntil(writeDoc(c.env, kvKey, fresh));
  if (fresh.status === 200) c.executionCtx.waitUntil(cache.put(cacheReq, res.clone()));
  logRead(c.env, c.executionCtx, c.req.raw, { domain, surface, started, cache: "miss", ext, status: fresh.status });
  return res;
});

/**
 * Resolve one URL into a stored document. This is the only place in the read
 * path that touches a merchant, and it is bounded: one detection handshake per
 * domain ever, then at most two API calls per document.
 */
async function build(
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
    contentType: "text/markdown; charset=utf-8",
    canonical: `https://${domain}${path}`,
    renderedAt: new Date().toISOString(),
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

  // The per-storefront machine index is the home doc in a different dress.
  if (path === "/llms.txt") {
    const doc = await resolve(shop, "/", query);
    if (doc.kind !== "home") return problem("notfound", 404);
    return {
      body: renderLlmsTxt(shop, doc.categories, rctx),
      status: 200,
      contentType: "text/plain; charset=utf-8",
      canonical: `https://${domain}/`,
      renderedAt: new Date().toISOString(),
    };
  }

  const doc = await resolve(shop, path, query);
  if (doc.kind === "notfound") return problem("notfound", 404);

  return {
    body: ext === "json" ? JSON.stringify({ shop, ...doc }, null, 2) : renderMarkdown(shop, doc, path, rctx),
    status: 200,
    contentType:
      ext === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
    canonical:
      doc.kind === "product"
        ? canonicalUrl(domain, doc.product.slug, rctx.attribution)
        : canonicalUrl(domain, path, rctx.attribution),
    renderedAt: new Date().toISOString(),
  };
}

function renderMarkdown(shop: Storefront, doc: Doc, path: string, rctx: RenderCtx): string {
  switch (doc.kind) {
    case "product":
      return renderProduct(shop, doc.product, rctx);
    case "listing":
      return renderListing(shop, doc, path, rctx);
    case "home":
      return renderHome(shop, doc.categories, rctx);
    default:
      return renderProblem(shop.domain, path, "notfound", rctx);
  }
}

// ------------------------------------------------------------------ responses

function toResponse(doc: StoredDoc, surface: string): Response {
  const ttl = doc.status === 200 ? (TTL[surface as keyof typeof TTL] ?? TTL.product) : TTL.problem;
  return new Response(doc.body, {
    status: doc.status,
    headers: {
      "content-type": doc.contentType,
      "cache-control": `public, max-age=${ttl.browser}, s-maxage=${ttl.edge}`,
      // Invariant 3: a mirror, not a competitor for the merchant's SEO.
      "x-robots-tag": "noindex, nofollow",
      "access-control-allow-origin": "*",
      link: `<${doc.canonical}>; rel="canonical"`,
      "x-decoindex-rendered-at": doc.renderedAt,
    },
  });
}

function logRead(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  req: Request,
  o: { domain: string; surface: string; started: number; cache: string; ext: string; status: number },
): void {
  track(env, ctx, {
    name: "read",
    domain: o.domain,
    surface: o.surface,
    ua: req.headers.get("user-agent") ?? undefined,
    country: (req.cf?.country as string) ?? undefined,
    ms: Date.now() - o.started,
    meta: { cache: o.cache, ext: o.ext, status: o.status },
  });
}

function classifySurface(path: string): string {
  if (path === "/") return "home";
  if (path === "/llms.txt") return "llms";
  if (/\/p\/?$/.test(path) || /\/products\/[^/]+\/?$/.test(path)) return "product";
  return "listing";
}

export default { fetch: app.fetch };

export { normalizeDomain } from "./lib/url";
