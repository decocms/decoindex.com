import type { Env } from "../env";
import { DASHBOARD_HTML } from "./dashboard";
import { overview, queries, topQueries, traffic } from "./stats";

/**
 * `/mcp` — the shop's admin as an MCP app, to add in deco Studio (or any MCP
 * host) and see what shoppers ask, which model answers better, what converts.
 *
 * Patterns lifted from decoindex's own /mcp (src/server/mcp/*), where each one
 * was paid for once already:
 *  - Studio's "Add MCP Server" stores only a URL, so the token may ride as ?token=.
 *  - Fails closed: no MCP_AUTH_TOKEN configured → 503; wrong/missing token → 401.
 *    There is no public tier: this is shoppers' queries, nothing here is public.
 *  - UI is published twice (MCP Apps for Studio, skybridge for OpenAI); one HTML.
 *  - initialize echoes the client's protocolVersion; notifications get 202.
 *  - GET with Accept: text/event-stream gets 405 (anything else makes clients reconnect-loop).
 *  - resources/templates/list answers [] — an error there blanks Studio's tab.
 *  - Nothing under /mcp is cacheable.
 */

const PROTOCOL_VERSION = "2025-06-18";
const UI_MCP_APP = "ui://decoshop/dashboard";
const UI_SKYBRIDGE = "ui://widget/decoshop-dashboard.html";
const RESOURCE = { name: "deco shop admin", description: "Queries, models, click-through and brands." };

type Args = Record<string, unknown>;
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);

const TOOLS = [
  {
    name: "shop_dashboard",
    title: "deco shop — painel",
    description:
      "Painel do deco shop: tráfego (pessoas vs previews de link vs bots, de onde vêm), volume, comparação entre modelos (latência, resultados, click-through, 👍/👎, erros), buscas recentes, buscas mais feitas e marcas mais clicadas.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Janela em dias (1–90). Padrão 7." },
        q: { type: "string", description: "Filtra as buscas recentes por texto." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_MCP_APP }, "openai/outputTemplate": UI_SKYBRIDGE },
    execute: async (env: Env, a: Args) => {
      const days = num(a.days, 7);
      const [ov, recent, top, tr] = await Promise.all([
        overview(env, days),
        queries(env, days, 60, str(a.q)),
        topQueries(env, days, 15),
        traffic(env, days),
      ]);
      return { ...ov, q: str(a.q) ?? null, recent, top, traffic: tr };
    },
  },
  {
    name: "shop_queries",
    title: "Buscas recentes",
    description: "Buscas feitas no deco shop, mais recentes primeiro: texto, departamento, modelo, latência, resultados, cliques, link de share.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number" },
        limit: { type: "number", description: "Até 200. Padrão 50." },
        q: { type: "string", description: "Filtra por texto." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    execute: async (env: Env, a: Args) => ({ queries: await queries(env, num(a.days, 7), num(a.limit, 50), str(a.q)) }),
  },
  {
    name: "shop_top_queries",
    title: "Buscas mais feitas",
    description: "As buscas mais repetidas no período (texto normalizado), com contagem e latência média.",
    inputSchema: { type: "object", properties: { days: { type: "number" }, limit: { type: "number" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    execute: async (env: Env, a: Args) => ({ top: await topQueries(env, num(a.days, 7), num(a.limit, 20)) }),
  },
] as const;

// Host plumbing deco Studio calls on connect; answered like decoindex does.
const HOST_TOOLS: Record<string, () => unknown> = {
  MCP_CONFIGURATION: () => ({
    stateSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: {}, additionalProperties: false },
    scopes: [],
  }),
  ON_MCP_CONFIGURATION: () => ({}),
};

function token(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7).trim() || null;
  return req.headers.get("x-mcp-auth")?.trim() || new URL(req.url).searchParams.get("token")?.trim() || null;
}

function same(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  const res = await route(req, env);
  res.headers.set("cache-control", "no-store");
  res.headers.set("x-robots-tag", "noindex");
  return res;
}

async function route(req: Request, env: Env): Promise<Response> {
  if (!env.MCP_AUTH_TOKEN) return rpcError(null, -32002, "MCP_AUTH_TOKEN is not configured on this deployment.", 503);
  const got = token(req);
  if (!got || !same(got, env.MCP_AUTH_TOKEN)) return rpcError(null, -32001, "Unauthorized.", 401);

  const url = new URL(req.url);
  // GET /mcp/ui — the same widget in a plain browser, data inlined. The only way to look at it outside a host.
  if (req.method === "GET" && url.pathname.replace(/\/+$/, "").endsWith("/ui")) {
    const args: Args = Object.fromEntries([...url.searchParams].filter(([k]) => k !== "token"));
    const data = await TOOLS[0].execute(env, args);
    return new Response(inline(DASHBOARD_HTML, data), { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (req.method === "GET" && (req.headers.get("accept") ?? "").includes("text/event-stream")) {
    return new Response("No server-initiated stream. POST JSON-RPC to /mcp.", { status: 405, headers: { allow: "POST" } });
  }
  if (req.method === "GET") {
    return Response.json({ name: "decoshop-admin", protocolVersion: PROTOCOL_VERSION, tools: TOOLS.map((t) => t.name) });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const body = (await req.json().catch(() => null)) as { jsonrpc?: string; id?: string | number | null; method?: string; params?: Args } | null;
  if (!body || body.jsonrpc !== "2.0" || !body.method) return rpcError(null, -32600, "Invalid Request", 400);
  if (body.id === undefined) return new Response(null, { status: 202 }); // notification

  try {
    return Response.json({ jsonrpc: "2.0", id: body.id, result: await dispatch(env, body.method, body.params ?? {}) });
  } catch (err) {
    return rpcError(body.id, (err as { code?: number }).code ?? -32603, err instanceof Error ? err.message : String(err));
  }
}

async function dispatch(env: Env, method: string, params: Args): Promise<unknown> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: "decoshop-admin", version: "1.0.0" },
        instructions:
          "Admin do deco shop (shop.decoindex.com). Use shop_dashboard para o panorama (abre o painel visual), shop_queries para ver o que as pessoas estão buscando e shop_top_queries para as buscas mais repetidas. Os dados são eventos de uso; não há dados pessoais além do texto da busca.",
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS.map(({ execute: _x, ...t }) => t) };
    case "tools/call": {
      const name = String(params.name ?? "");
      const host = HOST_TOOLS[name];
      if (host) {
        const out = host();
        return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false };
      }
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32601 });
      const out = await tool.execute(env, (params.arguments ?? {}) as Args);
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false };
    }
    case "resources/list":
      return {
        resources: [
          { uri: UI_MCP_APP, ...RESOURCE, mimeType: "text/html;profile=mcp-app" },
          { uri: UI_SKYBRIDGE, ...RESOURCE, mimeType: "text/html+skybridge" },
        ],
      };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "resources/read": {
      const uri = String(params.uri ?? "");
      const mimeType = uri === UI_MCP_APP ? "text/html;profile=mcp-app" : uri === UI_SKYBRIDGE ? "text/html+skybridge" : null;
      if (!mimeType) throw Object.assign(new Error(`Unknown resource: ${uri}`), { code: -32602 });
      return { contents: [{ uri, mimeType, text: DASHBOARD_HTML }] };
    }
    case "prompts/list":
      return { prompts: [] };
    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

/** `<` escaped so a query like `</script>` stays data; U+2028/9 are illegal in JS string literals. */
function inline(html: string, data: unknown) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
  return html.replace('<div id="root"></div>', `<div id="root"></div>\n<script>window.__DATA__=${json}</script>`);
}
