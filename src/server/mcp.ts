import type { Env } from "./env";
import { embedOne } from "./lib/embed";
import { getDomain, listDomains, upsertDomain } from "./lib/registry";
import { canonicalUrl, cacheKey, normalizeDomain } from "./lib/url";
import { renderProduct, renderSearch } from "./render/markdown";
import type { RenderCtx } from "./render/markdown";
import { WIDGET_HTML } from "./render/widget";

/**
 * MCP surface for decoindex — the same StorefrontDO, cache and invariants as
 * the HTTP routes in main.ts, reached over JSON-RPC 2.0 / Streamable HTTP
 * instead of REST. No SDK: the method surface is 7 calls, and staying on
 * plain Hono keeps this repo at its one real dependency.
 *
 * Every tool is a read. The "reads never crawl" invariant from CLAUDE.md
 * applies unchanged — an unknown domain gets queued and stubbed, never
 * fetched inline. See handleStorefront() in main.ts for the twin logic.
 *
 * ponytail: hand-rolled JSON-RPC dispatcher, ~230 lines, no batch-request
 * support (dropped from the MCP spec itself in 2025-06-18, so this isn't a
 * gap). If a client ever needs SSE streaming or session resumption, swap in
 * @modelcontextprotocol/sdk — the tool definitions below don't change, only
 * the transport around them.
 */

const RESOURCE_URI = "ui://decoindex/results";
const PROTOCOL_FALLBACK = "2025-06-18";

const WIDGET_CSP = {
  connect_domains: [],
  // img-src for the widget iframe. Ingestion is VTEX/Shopify-first (README),
  // so this covers most indexed catalogs. A merchant on its own image host
  // renders without a photo (widget degrades via <img onerror>) until its
  // CDN is added here — see the allowlist note in render/widget.ts.
  resource_domains: ["https://*.vtexassets.com", "https://*.vteximg.com.br", "https://cdn.shopify.com"],
};

// ------------------------------------------------------------- JSON Schemas

const DOMAIN_PROP = { type: "string", description: "Storefront domain, e.g. farmrio.com.br (no scheme, no path)." };

const TOOLS = [
  {
    name: "search_storefront",
    description:
      "Hybrid lexical + semantic search over one merchant's indexed catalog. Returns normalized product facts, never live stock or final price.",
    inputSchema: {
      type: "object",
      properties: {
        domain: DOMAIN_PROP,
        query: { type: "string", description: "Search query, any language (index is multilingual)." },
        limit: { type: "number", description: "Max results, default 12, capped at 50." },
      },
      required: ["domain", "query"],
    },
    _meta: { ui: { resourceUri: RESOURCE_URI }, "openai/outputTemplate": RESOURCE_URI, "openai/widgetCSP": WIDGET_CSP },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "get_product",
    description:
      "Fetch one indexed product by its path on the merchant's own site (the part after the domain, e.g. /vestido-longo/p).",
    inputSchema: {
      type: "object",
      properties: { domain: DOMAIN_PROP, path: { type: "string", description: "Merchant-relative path, leading slash." } },
      required: ["domain", "path"],
    },
    _meta: { ui: { resourceUri: RESOURCE_URI }, "openai/outputTemplate": RESOURCE_URI, "openai/widgetCSP": WIDGET_CSP },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "list_storefronts",
    description: "List merchant domains currently indexed by decoindex, biggest catalogs first.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max results, default 50, capped at 200." } },
    },
    _meta: { ui: { resourceUri: RESOURCE_URI }, "openai/outputTemplate": RESOURCE_URI, "openai/widgetCSP": WIDGET_CSP },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const;

// ------------------------------------------------------------------- cache

/** Same cache as the GET routes, so an MCP tool call and its REST equivalent
 * share one entry. This is the whole fix for POST bypassing the Cache API. */
async function cached(
  env: Env,
  domain: string,
  path: string,
  params: URLSearchParams,
  ttlSeconds: number,
  compute: () => Promise<unknown>,
  // main.ts's outer cache only ever stores a 200 (see `if (response.status
  // === 200)` in app.get("*")) — a "not indexed yet" stub is never cached
  // there, so a page that gets ingested a minute later is visible right
  // away. Default true matches search, where "0 hits" is itself a fact worth
  // caching; get_product overrides this so a still-queued product doesn't
  // get stuck reporting "queued" for a full day after it's actually indexed.
  shouldCache: (value: unknown) => boolean = () => true,
): Promise<unknown> {
  const key = cacheKey(env.PUBLIC_ORIGIN, domain, path, "json", params);
  const cache = caches.default;
  const req = new Request(key, { method: "GET" });
  const hit = await cache.match(req);
  if (hit) return hit.json();

  const value = await compute();
  if (!shouldCache(value)) return value;
  const res = new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", "cache-control": `s-maxage=${ttlSeconds}` },
  });
  await cache.put(req, res);
  return value;
}

// ------------------------------------------------------------------- tools

async function callSearchStorefront(env: Env, args: Record<string, unknown>) {
  const domain = normalizeDomain(String(args.domain ?? ""));
  const query = String(args.query ?? "").trim();
  const limit = Math.min(Math.max(Number(args.limit ?? 12) | 0, 1), 50);
  if (!domain) throw new Error("Invalid domain.");
  if (!query) throw new Error("query is required.");

  const rctx: RenderCtx = { publicOrigin: env.PUBLIC_ORIGIN, attribution: { param: env.ATTRIBUTION_PARAM, value: env.ATTRIBUTION_VALUE } };
  const row = await getDomain(env, domain);

  if (!row) {
    await upsertDomain(env, domain, { status: "queued", priority: 10 });
    await env.INGEST.send({ kind: "discover", domain, priority: "low" });
    return { text: `# ${domain}\n\nNot indexed yet. Ingestion queued — retry in a minute.\n`, structured: { queued: true, domain } };
  }
  if (row.status === "opted-out") {
    return { text: `# ${domain}\n\nThis merchant asked not to be indexed.\n`, structured: { optedOut: true, domain } };
  }

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const out = (await cached(env, domain, "/search", params, 3_600, async () => {
    const stub = env.STOREFRONT.get(env.STOREFRONT.idFromName(domain));
    const m = (await stub.getMeta()) ?? { domain, platform: row.platform, status: row.status, locale: "pt-BR", currency: "BRL", productCount: 0 };
    const queryVec = (await embedOne(env, query)) ?? undefined;
    const hits = await stub.search(query, { limit, queryVec });
    return { meta: m, query, hits };
  })) as { meta: Parameters<typeof renderSearch>[0]; query: string; hits: Parameters<typeof renderSearch>[2] };

  // The widget renders these hits directly (it can't call canonicalUrl()
  // itself), so bake the attributed link in server-side rather than let the
  // client reconstruct a bare merchant URL — invariant 3 applies to the
  // clickable card the same as it does to the "Buy:" line in renderSearch.
  const hitsWithUrl = out.hits.map((h) => ({ ...h, url: canonicalUrl(domain, h.product.slug, rctx.attribution) }));
  return { text: renderSearch(out.meta, out.query, out.hits, rctx), structured: { ...out, hits: hitsWithUrl } };
}

async function callGetProduct(env: Env, args: Record<string, unknown>) {
  const domain = normalizeDomain(String(args.domain ?? ""));
  const path = String(args.path ?? "").trim();
  if (!domain) throw new Error("Invalid domain.");
  if (!path.startsWith("/")) throw new Error("path must start with /.");

  const rctx: RenderCtx = { publicOrigin: env.PUBLIC_ORIGIN, attribution: { param: env.ATTRIBUTION_PARAM, value: env.ATTRIBUTION_VALUE } };
  const row = await getDomain(env, domain);
  if (!row) {
    await upsertDomain(env, domain, { status: "queued", priority: 10 });
    await env.INGEST.send({ kind: "discover", domain, priority: "low" });
    return { text: `# ${domain}\n\nNot indexed yet. Ingestion queued — retry in a minute.\n`, structured: { queued: true, domain } };
  }

  const out = (await cached(
    env,
    domain,
    path,
    new URLSearchParams(),
    86_400,
    async () => {
      const stub = env.STOREFRONT.get(env.STOREFRONT.idFromName(domain));
      const m = (await stub.getMeta()) ?? { domain, platform: row.platform, status: row.status, locale: "pt-BR", currency: "BRL", productCount: 0 };
      const product = await stub.getProductBySlug(path.replace(/\/$/, ""));
      if (!product) {
        await env.INGEST.send({ kind: "page", domain, path });
        return { meta: m, product: null };
      }
      return { meta: m, product };
    },
    // Don't cache a miss: main.ts never caches its 202 stub either (only a
    // 200 gets stored), so a page ingested a minute later shows up right
    // away instead of reporting "queued" for a full day.
    (v) => (v as { product: unknown }).product !== null,
  )) as { meta: Parameters<typeof renderProduct>[0]; product: Parameters<typeof renderProduct>[1] | null };

  if (!out.product) {
    return { text: `# Not indexed yet\n\nA fetch for ${domain}${path} has been queued; retry in a minute.\n`, structured: { queued: true, domain, path } };
  }
  return {
    text: renderProduct(out.meta, out.product, rctx),
    structured: { meta: out.meta, product: out.product, url: canonicalUrl(domain, out.product.slug, rctx.attribution) },
  };
}

async function callListStorefronts(env: Env, args: Record<string, unknown>) {
  const limit = Math.min(Math.max(Number(args.limit ?? 50) | 0, 1), 200);
  const rows = await listDomains(env, limit);
  const storefronts = rows.map((r) => ({ domain: r.domain, platform: r.platform, product_count: r.product_count }));
  const lines = storefronts.length
    ? storefronts.map((s) => `- ${s.domain} (${s.platform}, ${s.product_count} products)`).join("\n")
    : "No storefronts indexed yet.";
  return { text: `# Indexed storefronts\n\n${lines}\n`, structured: { storefronts } };
}

async function callTool(env: Env, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search_storefront":
      return callSearchStorefront(env, args);
    case "get_product":
      return callGetProduct(env, args);
    case "list_storefronts":
      return callListStorefronts(env, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// -------------------------------------------------------------- dispatcher

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: unknown, result: unknown): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, result });
}
function rpcError(id: unknown, code: number, message: string): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, code === -32000 ? 429 : 200);
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...mcpCorsHeaders(), "content-type": "application/json" } });
}

function mcpCorsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id, authorization",
  };
}

export function mcpCors(): Response {
  return new Response(null, { status: 204, headers: mcpCorsHeaders() });
}

export async function handleMcp(env: Env, req: Request): Promise<Response> {
  // R1: hard cap. Tool calls can miss the cache and trigger AI.run(); this is
  // the only thing standing between a public endpoint and an open-ended bill.
  if (env.MCP_RATE_LIMITER) {
    const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.MCP_RATE_LIMITER.limit({ key: ip });
    if (!success) return rpcError(null, -32000, "Rate limit exceeded. Retry shortly.");
  }

  let body: RpcRequest;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error: invalid JSON.");
  }
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError((body as { id?: unknown } | null)?.id, -32600, "Invalid Request.");
  }

  const { id, method, params } = body;
  const isNotification = id === undefined;

  try {
    switch (method) {
      case "initialize": {
        const clientVersion = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
        return rpcResult(id, {
          protocolVersion: clientVersion ?? PROTOCOL_FALLBACK,
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "decoindex", version: "1.0.0" },
        });
      }
      case "notifications/initialized":
        return new Response(null, { status: 202, headers: mcpCorsHeaders() });
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "resources/list":
        return rpcResult(id, {
          resources: [{ uri: RESOURCE_URI, name: "decoindex results", description: "Product grid / detail widget.", mimeType: "text/html;profile=mcp-app" }],
        });
      case "resources/read": {
        const uri = (params as { uri?: string } | undefined)?.uri;
        if (uri !== RESOURCE_URI) return rpcError(id, -32602, `Unknown resource: ${uri}`);
        return rpcResult(id, {
          contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: WIDGET_HTML, _meta: { "openai/widgetCSP": WIDGET_CSP } }],
        });
      }
      case "prompts/list":
        return rpcResult(id, { prompts: [] });
      case "tools/call": {
        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        if (!p?.name) return rpcError(id, -32602, "Missing tool name.");
        try {
          const out = await callTool(env, p.name, p.arguments ?? {});
          return rpcResult(id, { content: [{ type: "text", text: out.text }], structuredContent: out.structured });
        } catch (err) {
          // Tool-level failure is reported IN the result, not as a transport
          // error, per MCP convention — the model can read and react to it.
          return rpcResult(id, { content: [{ type: "text", text: `Error: ${String(err instanceof Error ? err.message : err)}` }], isError: true });
        }
      }
      default:
        if (isNotification) return new Response(null, { status: 202, headers: mcpCorsHeaders() });
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    return rpcError(id, -32603, `Internal error: ${String(err instanceof Error ? err.message : err)}`);
  }
}
