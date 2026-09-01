import { Hono } from "hono";
import type { Env, IngestJob } from "./env";
import { StorefrontDO } from "./do/storefront";
import { cacheKey, canonicalUrl, normalizeDomain, parsePath } from "./lib/url";
import { getDomain, stalest, track, upsertDomain } from "./lib/registry";
import { embedOne } from "./lib/embed";
import { renderBrand, renderLlmsTxt, renderPlp, renderProduct, renderSearch } from "./render/markdown";
import type { RenderCtx } from "./render/markdown";
import { runIngestJob } from "./ingest/pipeline";
import { LANDING_HTML } from "./render/landing";
import { handleMcp, mcpCors } from "./mcp";

export { StorefrontDO };

type Ctx = { Bindings: Env };
const app = new Hono<Ctx>();

/**
 * Cache policy is the product. An agent must be able to swap the domain into
 * any URL and get an answer without us paying to render anything, so:
 *
 *   reads never crawl. A read is a cache hit, or a DO read, or a stub.
 *
 * Refresh happens on the queue, driven by cron. A cold or unknown domain gets
 * a `queued` stub in milliseconds and an ingest job at low priority — which is
 * also what stops anyone from knocking us over with random URLs.
 */
const TTL = {
  product: { browser: 300, edge: 86_400, swr: 604_800 },
  search: { browser: 60, edge: 3_600, swr: 86_400 },
  brand: { browser: 300, edge: 3_600, swr: 86_400 },
  stub: { browser: 0, edge: 30, swr: 0 },
} as const;

app.get("/healthz", (c) => c.text("ok"));

app.get("/", (c) => c.html(LANDING_HTML));

app.get("/about", (c) =>
  c.text(
    [
      "decoindex — agent-readable mirrors of brand storefronts.",
      "",
      "Swap any storefront URL's origin for decoindex.com/<domain>/<path> and get",
      "normalized product facts as Markdown or JSON, with provenance and a stated",
      "freshness boundary. Catalog facts only: stock, final price and delivery must",
      "be verified with the merchant.",
      "",
      "We identify ourselves in every request, respect robots.txt for HTML fetches,",
      "never rehost images, mark every page noindex, and point rel=canonical at the",
      "merchant. Merchants: claim your domain or opt out at /opt-out.",
      "",
      "Built by deco (https://decocms.com).",
    ].join("\n"),
  ),
);

app.get("/opt-out", (c) =>
  c.text(
    [
      "To remove a domain from decoindex, email opt-out@decoindex.com from an address",
      "on that domain, or add this line to your robots.txt:",
      "",
      "  User-agent: decoindex",
      "  Disallow: /",
      "",
      "Removal is honoured within 24h and the domain is never re-indexed without an",
      "explicit request from the merchant.",
    ].join("\n"),
  ),
);

app.get("/privacy", (c) =>
  c.text(
    [
      "decoindex — data retention and privacy.",
      "",
      "We store, per merchant domain: catalog facts (title, attributes, variants,",
      "categories, observed base price) and their source/timestamp. We do not",
      "store shopper personal data, cookies, or session identifiers.",
      "",
      "First-party analytics (D1 `events` table) record which agent read what",
      "surface (openai/anthropic/perplexity/script/browser), a coarse country,",
      "and timing — never a request body or a user identifier. Pruned after 90",
      "days.",
      "",
      "Merchants: request removal at /opt-out, honoured within 24h.",
      "Built by deco (https://decocms.com).",
    ].join("\n"),
  ),
);

/**
 * MCP surface: same StorefrontDO, cache and invariants as the routes below,
 * reached over JSON-RPC instead of REST. Mounted before the catch-all so
 * parsePath("/mcp") never mistakes "mcp" for a domain.
 */
app.post("/mcp", (c) => handleMcp(c.env, c.req.raw));
app.options("/mcp", () => mcpCors());
app.get("/mcp", (c) => c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST for JSON-RPC." } }, 405));

/** Client-side beacon for the landing page. Cookieless. */
app.post("/e", async (c) => {
  const body = await c.req.json<{ name?: string; meta?: Record<string, unknown> }>().catch(() => null);
  if (body?.name) {
    await track(c.env, c.executionCtx, {
      name: body.name,
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

  const key = cacheKey(c.env.PUBLIC_ORIGIN, domain, path, ext, url.searchParams);
  const cache = caches.default;
  const cacheReq = new Request(key, { method: "GET" });
  const cached = await cache.match(cacheReq);
  if (cached) {
    await track(c.env, c.executionCtx, {
      name: "read",
      domain,
      surface,
      ua: c.req.header("user-agent"),
      country: (c.req.raw.cf?.country as string) ?? undefined,
      ms: Date.now() - started,
      meta: { cache: "hit", ext },
    });
    return cached;
  }

  const response = await handleStorefront(c.env, domain, path, ext, url.searchParams);

  await track(c.env, c.executionCtx, {
    name: "read",
    domain,
    surface,
    ua: c.req.header("user-agent"),
    country: (c.req.raw.cf?.country as string) ?? undefined,
    ms: Date.now() - started,
    meta: { cache: "miss", ext, status: response.status },
  });

  if (response.status === 200) {
    c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  }
  return response;
});

async function handleStorefront(
  env: Env,
  domain: string,
  path: string,
  ext: "md" | "json" | "html",
  query: URLSearchParams,
): Promise<Response> {
  const rctx: RenderCtx = {
    publicOrigin: env.PUBLIC_ORIGIN,
    attribution: { param: env.ATTRIBUTION_PARAM, value: env.ATTRIBUTION_VALUE },
  };

  const row = await getDomain(env, domain);

  if (row?.status === "opted-out") {
    return text(
      `# ${domain}\n\nThis merchant asked not to be indexed. Use the storefront directly: https://www.${domain}\n`,
      404,
      { domain, path, ttl: TTL.brand, canonical: `https://www.${domain}` },
    );
  }

  // Unknown domain: answer immediately, ingest later. Never crawl on read.
  if (!row) {
    await upsertDomain(env, domain, { status: "queued", priority: 10 });
    await env.INGEST.send({ kind: "discover", domain, priority: "low" });
    return text(stub(domain, env.PUBLIC_ORIGIN), 202, { domain, path, ttl: TTL.stub });
  }

  const stub_ = env.STOREFRONT.get(env.STOREFRONT.idFromName(domain));
  const meta = (await stub_.getMeta()) ?? {
    domain,
    platform: row.platform,
    status: row.status,
    locale: "pt-BR",
    currency: "BRL",
    productCount: 0,
  };

  if (meta.productCount === 0 && path !== "/") {
    return text(stub(domain, env.PUBLIC_ORIGIN), 202, { domain, path, ttl: TTL.stub });
  }

  // --- brand overview -------------------------------------------------------
  if (path === "/") {
    const [categories, sample] = await Promise.all([stub_.listCategories(), stub_.listProducts(10)]);
    if (ext === "json") return json({ meta, categories, sample }, { domain, path, ttl: TTL.brand });
    return text(renderBrand(meta, categories, sample, rctx), 200, { domain, path, ttl: TTL.brand });
  }

  // --- llms.txt -------------------------------------------------------------
  if (path === "/llms.txt") {
    const products = await stub_.listProducts(1000);
    return text(renderLlmsTxt(meta, products, rctx), 200, { domain, path, ttl: TTL.brand });
  }

  // --- full catalog ---------------------------------------------------------
  if (path === "/products" || path === "/products.json") {
    const limit = Math.min(Number(query.get("limit") ?? 200), 500);
    const offset = Number(query.get("offset") ?? 0);
    const products = await stub_.listProducts(limit, offset);
    return json({ meta, products }, { domain, path, ttl: TTL.brand });
  }

  // --- search ---------------------------------------------------------------
  if (path === "/search") {
    const q = (query.get("q") ?? "").trim();
    if (!q) return text(`# Search\n\nProvide \`?q=\`.\n`, 400, { domain, path, ttl: TTL.stub });
    const limit = Math.min(Number(query.get("limit") ?? 12), 50);
    const queryVec = (await embedOne(env, q)) ?? undefined;
    const hits = await stub_.search(q, { limit, queryVec });
    if (ext === "json") return json({ meta, query: q, hits }, { domain, path, ttl: TTL.search });
    return text(renderSearch(meta, q, hits, rctx), 200, { domain, path, ttl: TTL.search });
  }

  // --- category listing -----------------------------------------------------
  if (path.startsWith("/c/")) {
    const category = decodeURIComponent(path.slice(3)).replace(/\/$/, "");
    const products = await stub_.listByCategory(category, 60);
    if (ext === "json") return json({ meta, category, products }, { domain, path, ttl: TTL.brand });
    return text(renderPlp(meta, category, products, rctx), 200, { domain, path, ttl: TTL.brand });
  }

  // --- a product page on the merchant's own path ----------------------------
  const product = await stub_.getProductBySlug(path.replace(/\/$/, ""));
  if (!product) {
    await env.INGEST.send({ kind: "page", domain, path });
    return text(
      `---\ndecoindex: "1.0"\nindex_status: queued\ndomain: ${domain}\n---\n\n# Not indexed yet\n\nThis path is not in the index. A fetch has been queued; retry in a minute.\nBrowse what is indexed: ${env.PUBLIC_ORIGIN}/${domain}\n`,
      202,
      { domain, path, ttl: TTL.stub },
    );
  }

  if (ext === "json") return json({ meta, product }, { domain, path, ttl: TTL.product });
  return text(renderProduct(meta, product, rctx), 200, {
    domain,
    path,
    ttl: TTL.product,
    canonical: canonicalUrl(domain, product.slug, rctx.attribution),
  });
}

// ------------------------------------------------------------------ responses

interface RespOpts {
  domain: string;
  path: string;
  ttl: { browser: number; edge: number; swr: number };
  canonical?: string;
}

function headers(o: RespOpts, contentType: string): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": contentType,
    "cache-control": `public, max-age=${o.ttl.browser}, s-maxage=${o.ttl.edge}, stale-while-revalidate=${o.ttl.swr}`,
    // We are a mirror for agents, not a competitor for the merchant's SEO.
    // The day we outrank their PDP is the day we stop being a channel.
    "x-robots-tag": "noindex, nofollow",
    "access-control-allow-origin": "*",
  };
  const canonical = o.canonical ?? `https://www.${o.domain}${o.path}`;
  h["link"] = `<${canonical}>; rel="canonical"`;
  return h;
}

function text(body: string, status: number, o: RespOpts): Response {
  return new Response(body, { status, headers: headers(o, "text/markdown; charset=utf-8") });
}

function json(body: unknown, o: RespOpts): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: headers(o, "application/json; charset=utf-8"),
  });
}

function stub(domain: string, origin: string): string {
  return [
    `---`,
    `decoindex: "1.0"`,
    `domain: ${domain}`,
    `index_status: queued`,
    `---`,
    ``,
    `# ${domain}`,
    ``,
    `This storefront is not indexed yet. Ingestion has been queued — retry in a few minutes.`,
    `Meanwhile, the merchant's own site is authoritative: https://www.${domain}`,
    ``,
    `What will be here: ${origin}/${domain} (overview), /search?q=, /llms.txt, /products.json`,
    ``,
  ].join("\n");
}

function classifySurface(path: string): string {
  if (path === "/") return "brand";
  if (path === "/search") return "search";
  if (path === "/llms.txt") return "llms";
  if (path.startsWith("/products")) return "catalog";
  if (path.startsWith("/c/")) return "category";
  return "product";
}

// ------------------------------------------------------------------- handlers

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<IngestJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await runIngestJob(env, msg.body);
        msg.ack();
      } catch (err) {
        const domain = "domain" in msg.body ? msg.body.domain : "unknown";
        await upsertDomain(env, domain, { last_error: String(err).slice(0, 500) });
        // Retry only total failures. A partially applied catalog page is fine —
        // upserts are idempotent, and the next cron pass will finish the job.
        if (msg.attempts >= 2) msg.ack();
        else msg.retry();
      }
    }
  },

  /** Hourly: refresh the stalest storefronts, highest priority first. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const rows = await stalest(env, 20);
        for (const row of rows) {
          await env.INGEST.send({ kind: "catalog", domain: row.domain });
        }
      })(),
    );
  },
};

export { normalizeDomain };
