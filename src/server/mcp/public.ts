import type { Env } from "../env";
import { normalizeDomain, parsePath, type Ext } from "../lib/url";
import { readThrough } from "../lib/read";
import { listActiveDomains } from "../lib/registry";
import type { ToolDefinition } from "./tools";
import { rpcError } from "./tools";

/**
 * The public tier of /mcp: the product, as tools, for a host that would rather
 * call a tool than fetch a URL (ChatGPT, Claude Desktop, deco Studio).
 *
 * These are not a second implementation of anything. Each one resolves a URL
 * through `readThrough()` — the exact function behind `GET /{domain}/{path}` —
 * so the three invariants hold by construction: bounded upstream calls, the
 * per-domain rate limit, the shared cache entry, one event per read. If a tool
 * here ever stops going through readThrough(), it has stopped being a read.
 *
 * Naming is action-oriented per the Apps SDK guidance, and every tool is
 * annotated `readOnlyHint` — nothing here can change a merchant's data, and a
 * host that surfaces write-risk to users should be able to see that.
 */

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

/** Shape of what a read tool hands back to the model, alongside the Markdown. */
const READ_OUTPUT = object({
  decoindex_url: { type: "string", description: "The document that was read." },
  canonical_url: { type: "string", description: "The merchant's own page. Send users here." },
  domain: { type: "string" },
  status: { type: "integer", description: "200 means a document; 404/415/502 mean the reason is in the text." },
  observed_at: { type: "string", description: "When these facts were read from the merchant." },
});

/**
 * Accept whatever a model happens to be holding.
 *
 * In practice that is one of four things, and rejecting three of them to be
 * strict just moves the failure to a retry: a full storefront URL, a bare
 * domain, a decoindex URL the model saw earlier, or a domain plus a path. All
 * four reduce to the same triple.
 */
export function parseTarget(
  input: string,
  publicOrigin: string,
): { domain: string; path: string; ext: Ext; query: URLSearchParams } {
  const raw = input.trim();
  if (!raw) throw rpcError(-32602, "Empty url.");

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw rpcError(-32602, `Not a URL: ${input}`);
  }

  // A decoindex URL already carries {domain}/{path} inside its own pathname, so
  // it goes to the same parser the HTTP route uses rather than being read as a
  // merchant called "decoindex.com".
  //
  // Matching PUBLIC_ORIGIN alone is not enough: this Worker also answers on
  // workers.dev, on preview URLs and on localhost, and a model handed one of
  // those would have its *host* taken for the merchant. So the second test is
  // structural — if the first path segment is itself a domain, this is one of
  // our URLs whatever host it arrived on. A real storefront path starts with a
  // slug (`moda-feminina`, `products`), not with something ending in a live TLD,
  // and normalizeDomain already rejects the file-extension lookalikes that would
  // make this ambiguous (`config.js`, `favicon.ico`).
  const ourHost = new URL(publicOrigin).host.replace(/^www\./, "");
  const firstSegment = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  if (url.host.replace(/^www\./, "") === ourHost || normalizeDomain(firstSegment)) {
    const parsed = parsePath(url.pathname);
    if (!parsed) throw rpcError(-32602, `No storefront domain in ${input}`);
    return { ...parsed, query: url.searchParams };
  }

  const domain = normalizeDomain(url.host);
  if (!domain) {
    throw rpcError(
      -32602,
      `Not a storefront domain: ${url.host}. Pass a storefront URL (https://www.farmrio.com.br/vestido/p) or a bare domain (farmrio.com.br).`,
    );
  }
  return { domain, path: url.pathname || "/", ext: "md", query: url.searchParams };
}

async function read(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  target: { domain: string; path: string; ext: Ext; query: URLSearchParams },
) {
  const { doc } = await readThrough(env, ctx, target.domain, target.path, target.ext, target.query, {
    publicOrigin: env.PUBLIC_ORIGIN,
    attribution: { param: env.ATTRIBUTION_PARAM, value: env.ATTRIBUTION_VALUE },
  });

  const q = target.query.toString();
  return {
    markdown: doc.body,
    structured: {
      decoindex_url: `${env.PUBLIC_ORIGIN}/${target.domain}${target.path}${q ? `?${q}` : ""}`,
      canonical_url: doc.canonical,
      domain: target.domain,
      status: doc.status,
      observed_at: doc.renderedAt,
    },
  };
}

export const publicTools: ToolDefinition[] = [
  {
    name: "navigate_storefront",
    title: "Read a storefront page as Markdown",
    description:
      "Read any product page, category listing or storefront homepage as normalized Markdown, instead of fetching a megabyte of client-rendered HTML that has no prices in it. Pass the storefront URL you already have — `https://www.farmrio.com.br/some-product/p` — or a bare domain for the overview. Works on any VTEX or Shopify store with no setup. A product page comes back with price, variants, per-SKU stock and a cart link; a category comes back as a table. Use `?sort=price_asc` in the URL to order the whole catalog rather than one page, and note the first page of a listing is neither the whole catalog nor price-ordered.",
    inputSchema: object(
      {
        url: {
          type: "string",
          description:
            "A storefront URL (`https://www.farmrio.com.br/vestido/p`), a bare domain (`farmrio.com.br`), or a decoindex URL. Query params are kept: `?page=`, `?sort=`, `?q=`.",
        },
      },
      ["url"],
    ),
    outputSchema: READ_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (env, input, ctx) => {
      const url = input.url;
      if (typeof url !== "string") throw rpcError(-32602, "Missing required parameter: url");
      const { markdown, structured } = await read(env, ctx, parseTarget(url, env.PUBLIC_ORIGIN));
      return { markdown, ...structured };
    },
  },
  {
    name: "search_storefront",
    title: "Search one storefront's catalog",
    description:
      "Search a single merchant's catalog and get matching products as Markdown, each with price and availability. This is the fastest way from 'the user named a brand and a thing' to 'a product with a price'. Site search on brand storefronts is uniformly bad and is exactly where an agent gives up. Set `sort` to `price_asc` when the question is about the cheapest option — it orders the whole catalog server-side, so reading page 1 and picking the lowest number is wrong.",
    inputSchema: object(
      {
        domain: {
          type: "string",
          description: "Registrable domain, no scheme and no www. Example: farmrio.com.br",
        },
        q: { type: "string", description: "What to search for. Any language." },
        sort: {
          type: "string",
          enum: ["price_asc", "price_desc", "name_asc", "name_desc", "discount", "new"],
          description: "Orders the whole result set, not just the current page.",
        },
        page: { type: "integer", minimum: 1, description: "1-based. Defaults to the first page." },
      },
      ["domain", "q"],
    ),
    outputSchema: READ_OUTPUT,
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (env, input, ctx) => {
      const domain = normalizeDomain(String(input.domain ?? ""));
      if (!domain) throw rpcError(-32602, "Missing or invalid parameter: domain");
      const q = typeof input.q === "string" ? input.q.trim() : "";
      if (!q) throw rpcError(-32602, "Missing required parameter: q");

      const query = new URLSearchParams({ q });
      if (typeof input.sort === "string") query.set("sort", input.sort);
      if (typeof input.page === "number" && input.page > 1) query.set("page", String(input.page));

      const { markdown, structured } = await read(env, ctx, {
        domain,
        path: "/search",
        ext: "md",
        query,
      });
      return { markdown, ...structured };
    },
  },
  {
    name: "list_storefronts",
    title: "List storefronts known to work",
    description:
      "List the storefronts already known to this service, with platform and merchant name. Use this when the user names a brand but you have no URL, or to check whether a domain is readable before trying it. Any VTEX or Shopify domain works whether or not it is on this list — the list is what has been read before, not an allowlist.",
    inputSchema: object({
      limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    }),
    outputSchema: object({
      storefronts: {
        type: "array",
        items: object({
          domain: { type: "string" },
          platform: { type: "string" },
          name: { type: "string" },
          currency: { type: "string" },
          decoindex_url: { type: "string" },
        }),
      },
      total: { type: "integer" },
    }),
    annotations: { readOnlyHint: true },
    execute: async (env, input) => {
      const limit = typeof input.limit === "number" ? Math.min(Math.max(input.limit, 1), 200) : 50;
      const rows = await listActiveDomains(env, limit);
      return {
        total: rows.length,
        storefronts: rows.map((r) => ({
          domain: r.domain,
          platform: r.platform,
          name: r.merchant_name ?? r.domain,
          currency: r.currency,
          decoindex_url: `${env.PUBLIC_ORIGIN}/${r.domain}`,
        })),
      };
    },
  },
];
