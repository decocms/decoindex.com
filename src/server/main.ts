import { Hono } from "hono";
import type { Env } from "./env";
import { parsePath } from "./lib/url";
import { classifyClient, track } from "./lib/registry";
import { readDoc, docKey } from "./lib/store";
import { classifySurface, readThrough } from "./lib/read";
import { BadReport, submitFeedback } from "./lib/feedback";
import { handleMcp } from "./mcp/server";
import { SAMPLE, landingHtml } from "./render/landing";
import {
  benchmarkHtml,
  type BenchResults,
  type JourneyRun,
  type ModelResults,
} from "./render/benchmark";
// Imported as bytes via the "Data" rule in wrangler.jsonc.
import ogImage from "../../assets/og.png";
// The committed output of `npm run bench`. Static data — the page makes no
// upstream call, so the bounded-read invariant is untouched.
import benchResults from "../../bench/results/latest.json";
import benchJourneys from "../../bench/results/journeys.json";
import benchModels from "../../bench/results/models.json";
import benchErrand from "../../bench/results/models-errand.json";

type Ctx = { Bindings: Env };
const app = new Hono<Ctx>();


app.get("/healthz", (c) => c.text("ok"));

/**
 * The comparison on the landing page shows the real current document, read out
 * of our own KV — never fetched from the merchant, so the landing page stays
 * within invariant 1 and costs one KV read.
 */
/**
 * An agent asking for the root wants to know what this service is; a person
 * wants the page. Same URL, two audiences, so classify and send agents to the
 * machine index rather than making them parse marketing HTML.
 *
 * `no-store` is what makes this safe. The representation depends on the caller,
 * and no cache in front of us honours Vary reliably — Cloudflare's zone cache
 * ignores it outright. An uncacheable redirect is the only version that cannot
 * be replayed to the wrong audience.
 */
app.get("/", async (c, next) => {
  const cls = classifyClient(c.req.header("user-agent"));
  const wantsMachine = !["browser", "search-engine", "unknown"].includes(cls);
  if (wantsMachine && !c.req.query("html")) {
    track(c.env, c.executionCtx, {
      name: "read",
      surface: "root-redirect",
      ua: c.req.header("user-agent"),
      country: (c.req.raw.cf?.country as string) ?? undefined,
    });
    return c.redirect(`${c.env.PUBLIC_ORIGIN}/llms.txt`, 302);
  }
  return next();
});

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

/**
 * The benchmark. Rendered from the committed `bench/results/latest.json`, so it
 * is a static page: no KV, no D1, no upstream call.
 */
app.get("/benchmark", (c) =>
  c.html(
    benchmarkHtml(
      c.env.PUBLIC_ORIGIN,
      benchResults as unknown as BenchResults,
      benchJourneys as unknown as JourneyRun[],
      benchModels as unknown as ModelResults,
      benchErrand as unknown as ModelResults,
    ),
  ),
);

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
      "Allow: /benchmark",
      "Allow: /opt-out",
      "Allow: /llms.txt",
      "Allow: /og.png",
      "Disallow: /",
      "",
      // Named explicitly so there is no ambiguity for the clients that matter.
      "User-agent: GPTBot",
      "User-agent: ChatGPT-User",
      "User-agent: OAI-SearchBot",
      "User-agent: ClaudeBot",
      "User-agent: Claude-User",
      "User-agent: Claude-SearchBot",
      "User-agent: PerplexityBot",
      "User-agent: Perplexity-User",
      "User-agent: Google-Extended",
      "Allow: /",
      "",
      "User-agent: *",
      "Allow: /",
      "",
      `Sitemap: none — this service is resolved on demand, not enumerable.`,
      `# Machine index: ${c.env.PUBLIC_ORIGIN}/llms.txt`,
    ].join("\n"),
  ),
);

app.get("/llms.txt", (c) => {
  const o = c.env.PUBLIC_ORIGIN;
  return c.text(
    [
      "# decoindex",
      "",
      "> Storefronts an agent can read. Take any VTEX or Shopify storefront URL, put",
      "> `decoindex.com/` in front of the domain, and get normalized Markdown instead of",
      "> a megabyte of client-rendered HTML. Resolved on demand from the merchant's own",
      "> public API, so any URL works on the first request.",
      "",
      "## The whole convention",
      "",
      "```",
      "https://www.farmrio.com.br/moda-feminina",
      `${o}/farmrio.com.br/moda-feminina`,
      "```",
      "",
      `- \`${o}/{domain}\` — start here. The storefront overview: what the merchant`,
      "  says it is, its categories, its best sellers, and the terms its own shoppers",
      "  search for. One request, and you know whether this store is worth exploring.",
      "- Any storefront path works the same way. Product pages, category listings.",
      "- `?page=N` paginates. `?sort=price_asc` orders the whole catalog, not just the",
      "  page you were handed (also price_desc, name_asc, name_desc, discount, new).",
      `- \`${o}/{domain}/search?q={words}\` searches that storefront. \`/busca/{words}\``,
      "  works too — it is the search path the store itself uses.",
      "- Append `.json` to any of these for the same document, structured.",
      "",
      "## Storefronts that work today",
      "",
      "Some of the largest retailers in Brazil, roughly by traffic. Each was checked",
      "end to end when this list was written — overview, search, a price-ordered",
      "listing, and a product page with a price on it. Start at any of them.",
      "",
      `- ${o}/cea.com.br — C&A. Fashion, and the heaviest page we know of: 5.7 MB of HTML.`,
      `- ${o}/paguemenos.com.br — Pague Menos. Pharmacy.`,
      `- ${o}/americanas.com.br — Americanas. General retailer, 58 top-level categories.`,
      `- ${o}/farmrio.com.br — Farm Rio. Fashion; overview carries best sellers and top searches.`,
      `- ${o}/hering.com.br — Hering. Fashion, 117 categories.`,
      `- ${o}/drogariasaopaulo.com.br — Drogaria São Paulo. Pharmacy, 1,600 categories.`,
      `- ${o}/lojastorra.com.br — Lojas Torra. Fashion.`,
      `- ${o}/vivara.com.br — Vivara. Jewellery.`,
      `- ${o}/lebiscuit.com.br — Le Biscuit. Homeware.`,
      `- ${o}/fila.com.br — Fila. Footwear and sportswear.`,
      `- ${o}/osklen.com.br — Osklen. Rio lifestyle brand.`,
      `- ${o}/bagaggio.com.br — Bagaggio. Luggage.`,
      `- ${o}/technos.com.br — Technos. Watches.`,
      `- ${o}/allbirds.com — Allbirds. A Shopify store in the US: same convention, other platform.`,
      "",
      "The same URL shapes work on every one of them:",
      "",
      `- ${o}/americanas.com.br/search?q=playstation%205 — search a storefront`,
      `- ${o}/cea.com.br/moda-feminina?sort=price_asc — cheapest first, across the whole category`,
      `- ${o}/farmrio.com.br/busca/vestido — the store's own search path also works`,
      "",
      "Product pages are reached from any listing: every row carries a Details link.",
      "They are not listed here by hand, because a hardcoded SKU is a dead link the",
      "day it sells out.",
      "",
      "This list is checked, not guaranteed. A storefront can change or start refusing",
      "us at any time; if one of these is broken, the feedback endpoint below is the",
      "fastest way to tell us.",
      "",
      "## What a product page gives you",
      "",
      "Frontmatter with the canonical URL, platform, currency, observed price and",
      "availability. Then every variant with its own SKU, price, stock and a cart link",
      "that builds a cart on the merchant's own checkout — so a read can end in a",
      "purchase a person completes, not just a description.",
      "",
      "## What is not published",
      "",
      "Live stock for a chosen variant, the final price after cart promotions and",
      "coupons, delivery dates for an address, and anything priced for one shopper.",
      "Those belong to the merchant. Every document repeats this in its own body, so a",
      "page read in isolation still knows what it may promise.",
      "",
      "## Telling us something is wrong",
      "",
      "The only way we learn a document is bad:",
      "",
      "```",
      `curl -X POST ${o}/feedback -H 'content-type: application/json' \\`,
      `  -d '{"url":"<the decoindex URL>","kind":"wrong_data","message":"what you expected"}'`,
      "```",
      "",
      "No authentication. `kind`: wrong_data, missing, broken, unsupported, other.",
      "",
      "## Notes",
      "",
      "- Supported platforms: VTEX and Shopify.",
      "- The merchant's own site is always canonical; every response says so.",
      `- Cost of reading a storefront both ways: ${o}/benchmark`,
      `- Merchants: ${o}/opt-out`,
    ].join("\n"),
  );
});

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
      "To remove a domain from decoindex, email builders+indexoptout@decocms.com from an",
      "address on that domain. Removal is honoured within 24h and the domain is never",
      "re-mirrored without an explicit request from the merchant.",
      "",
      "You can also block us at the edge: we identify ourselves as `decoindex` in the",
      "User-Agent of every request and we do not work around blocks.",
    ].join("\n"),
  ),
);

/**
 * OpenAI Plugin directory domain verification. One-time challenge, not a
 * secret — it exists specifically to be read at this fixed public URL, so
 * committing it is correct, not a leak.
 */
app.get("/.well-known/openai-apps-challenge", (c) => c.text("v2E1ZHPwOGh720oMzrX_Un5fhOMgdzkH2f3Ye-XWThc"));

app.get("/support", (c) =>
  c.text(
    [
      "decoindex support.",
      "",
      "A tool call or a page returned something wrong? File it at POST /feedback — no",
      "key needed, and it goes straight into triage:",
      "",
      "  curl -X POST https://decoindex.com/feedback \\",
      "    -H 'content-type: application/json' \\",
      "    -d '{\"url\":\"https://decoindex.com/<domain><path>\",\"kind\":\"wrong_data\",\"message\":\"what you expected vs what you got\"}'",
      "",
      "kind: wrong_data · missing · broken · unsupported · other.",
      "",
      "Anything else — email builders+indexsupport@decocms.com. Merchant asking about a",
      "domain: see /opt-out. What this service is and isn't: see /about.",
      "",
      "Built by deco (https://decocms.com).",
    ].join("\n"),
  ),
);

/**
 * Agent feedback. Public and unauthenticated on purpose: an agent that just hit
 * a wrong document will not stop to go get a key, and a report we never receive
 * is a bug we never learn about. Rate limited per IP instead.
 */
app.get("/feedback", (c) =>
  c.json({
    how: "POST JSON here. No authentication.",
    fields: {
      url: "The decoindex URL that was wrong (or pass domain + path separately).",
      kind: "wrong_data | missing | broken | unsupported | other",
      message: "Required. What went wrong, in your own words.",
      expected: "Optional. What you expected instead.",
    },
    example: {
      url: `${c.env.PUBLIC_ORIGIN}/farmrio.com.br/some-product/p`,
      kind: "wrong_data",
      message: "Variants table was empty but the storefront shows four sizes.",
    },
  }),
);

app.post("/feedback", async (c) => {
  if (c.env.FEEDBACK_LIMIT) {
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    const { success } = await c.env.FEEDBACK_LIMIT.limit({ key: ip });
    if (!success) {
      return c.json({ error: "Too many reports from this address. Try again shortly." }, 429);
    }
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "Body must be JSON. GET this URL for the shape." }, 400);

  try {
    const result = await submitFeedback(c.env, body, {
      ua: c.req.header("user-agent"),
      country: (c.req.raw.cf?.country as string) ?? undefined,
    });
    track(c.env, c.executionCtx, {
      name: "feedback",
      domain: typeof body.domain === "string" ? body.domain : undefined,
      surface: "feedback",
      ua: c.req.header("user-agent"),
      country: (c.req.raw.cf?.country as string) ?? undefined,
      meta: { kind: body.kind, id: result.id },
    });
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof BadReport) return c.json({ error: err.message }, 400);
    throw err;
  }
});

/** Private control plane. Fails closed when MCP_AUTH_TOKEN is unset. */
app.all("/mcp", (c) => handleMcp(c.req.raw, c.env, c.executionCtx));
app.all("/mcp/*", (c) => handleMcp(c.req.raw, c.env, c.executionCtx));

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
  const result = await readThrough(c.env, c.executionCtx, domain, path, ext, url.searchParams, {
    publicOrigin: c.env.PUBLIC_ORIGIN,
    attribution: { param: c.env.ATTRIBUTION_PARAM, value: c.env.ATTRIBUTION_VALUE },
  });

  logRead(c.env, c.executionCtx, c.req.raw, {
    domain,
    surface: classifySurface(path),
    started,
    cache: result.cache,
    ext,
    status: result.doc.status,
  });
  return forClient(result.response);
});

// ------------------------------------------------------------------ responses

/**
 * Last stop before the caller: shorten the *shared* TTL. On a Workers custom domain, Cloudflare's zone
 * cache sits in front of the Worker and honours s-maxage, so a long one means
 * the public URL is answered without the Worker ever running — and RENDER_VERSION,
 * which only exists inside our own cache key, cannot reach it. A category fix
 * stayed invisible on decoindex.com for hours while being correct on workers.dev,
 * with `cf-cache-status: HIT, age: 322` as the giveaway.
 *
 * The long TTL still applies to what we store in the Cache API ourselves, where
 * the key is versioned and a deploy busts it. The zone layer keeps 60 seconds,
 * which is plenty of protection against a stampede and short enough that a fix
 * is live within a minute.
 */
function forClient(res: Response): Response {
  const out = new Response(res.body, res);
  const browser = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? "300";
  out.headers.set("cache-control", `public, max-age=${browser}, s-maxage=60`);
  return out;
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

export default { fetch: app.fetch };

export { normalizeDomain } from "./lib/url";
