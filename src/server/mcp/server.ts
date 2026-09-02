import type { Env } from "../env";
import { authorize, type Tier } from "./auth";
import { tools as operatorTools, type ToolDefinition } from "./tools";
import { publicTools } from "./public";
import { TRAFFIC_WIDGET_HTML } from "../render/dashboard";

/**
 * MCP over JSON-RPC 2.0 on POST /mcp: initialize, ping, tools/list, tools/call,
 * resources/list, prompts/list. No SSE — request/response only, which is all any
 * client here needs and all a Worker should hold open.
 *
 * The endpoint serves two tiers off one URL (see auth.ts). An anonymous caller
 * gets the read tools; a caller with the shared secret also gets the control
 * plane. `tools/list` is filtered per tier, so a tool a caller may not invoke is
 * one it never sees advertised.
 */

/**
 * The date-based version ChatGPT and Claude both negotiate. Streamable HTTP,
 * which is what the Apps SDK expects, arrived in this revision — announcing the
 * older 2024-11-05 made hosts fall back to assumptions that do not hold here.
 */
const PROTOCOL_VERSION = "2025-06-18";

const PUBLIC_INSTRUCTIONS = [
  "decoindex reads VTEX and Shopify storefronts as normalized Markdown, resolved on",
  "demand from each merchant's own public catalog API. No key, no setup, any store.",
  "",
  "If the user has a storefront URL, call navigate_storefront with it unchanged.",
  "If they named a brand and a product, call search_storefront. If they named only a",
  "brand, navigate_storefront on the bare domain returns the overview: categories,",
  "best sellers and the terms that store's own shoppers search for.",
  "",
  "Two traps worth avoiding. The first page of a listing is neither the whole catalog",
  "nor ordered by price, so use sort=price_asc for anything about the cheapest option.",
  "And product slugs cannot be guessed — take them from a listing or a search result.",
  "",
  "What you get is a catalog fact observed at a stated time: title, attributes,",
  "variants, an observed base price, an as-observed availability signal. What you do",
  "NOT get is live stock, the final price after promotions and coupons, or delivery",
  "dates. Never state those as fact. Quote the price as of observed_at and send the",
  "user to canonical_url on the merchant's own site to confirm before they buy —",
  "promising what a merchant cannot honour costs them the sale and the customer.",
].join("\n");

const OPERATOR_INSTRUCTIONS = [
  PUBLIC_INSTRUCTIONS,
  "",
  "You are authenticated, so the control plane is also available.",
  "",
  "Start with feedback_list({status:'new'}) — that is the untriaged queue of documents",
  "agents reported as wrong. Every report carries the exact domain and path, so open",
  "https://decoindex.com/{domain}{path} and reproduce it before deciding anything.",
  "",
  "traffic_stats is the health metric: reads from openai, anthropic, perplexity and",
  "script are the business. Browser pageviews are vanity — do not report them as growth.",
  "",
  "Mark a report 'fixed' only after the fix is deployed and that URL actually returns",
  "the right document. Leave a note saying what was wrong; the note is the memory.",
].join("\n");

function toolsFor(tier: Tier): ToolDefinition[] {
  return tier === "operator" ? [...publicTools, ...operatorTools] : publicTools;
}

/**
 * deco Studio's install handshake.
 *
 * Studio calls `MCP_CONFIGURATION` to learn what an app needs configured and
 * what it is allowed to do, and `ON_MCP_CONFIGURATION` after a user saves that
 * configuration. Answering "unknown tool" is what put a 40% error rate on the
 * app's own dashboard — the tools all listed and worked, but every install
 * logged two failures against us.
 *
 * decoindex needs neither. It is a public read service: there is nothing to
 * configure per installation and no scope to request, because a tool call here
 * reaches exactly the same public documents the URL does. So the honest answer
 * is an empty schema and an empty scope list, said explicitly, rather than an
 * error that reads as a broken integration.
 *
 * Deliberately NOT in `tools/list`. These are host plumbing, not capabilities a
 * model should ever choose to invoke — advertising them would put two
 * meaningless entries in front of every ChatGPT user. Answering a call for a
 * tool we do not advertise is safe here precisely because they expose nothing:
 * no data in, no data out.
 */
const HOST_TOOLS: Record<string, () => unknown> = {
  MCP_CONFIGURATION: () => ({
    stateSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    scopes: [],
  }),
  ON_MCP_CONFIGURATION: () => ({}),
};

/** Must match `_meta["openai/outputTemplate"]` on traffic_stats exactly. */
export const TRAFFIC_WIDGET_URI = "ui://widget/decoindex-traffic.html";

function resourcesFor(tier: Tier) {
  if (tier !== "operator") return [];
  return [
    {
      uri: TRAFFIC_WIDGET_URI,
      name: "decoindex traffic",
      description: "Reads by agent class, surface and storefront, over time.",
      mimeType: "text/html+skybridge",
    },
  ];
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export async function handleMcp(
  request: Request,
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<Response> {
  const auth = authorize(request, env);
  if (!auth.ok) return auth.response;
  const { tier } = auth;

  /**
   * `GET /mcp/ui` — the same widget, in a browser.
   *
   * A `ui://` resource only renders inside a host that implements the Apps SDK,
   * which makes the screen impossible to look at while building it and
   * impossible to check after deploying. Serving the identical HTML over a plain
   * GET, with the tool's own output inlined, costs one branch and means there is
   * exactly one template to keep correct rather than a widget and a shadow copy.
   *
   * Operator only, and `no-store`: this is our traffic, and it names merchants.
   */
  if (request.method === "GET" && new URL(request.url).pathname.replace(/\/+$/, "").endsWith("/ui")) {
    if (tier !== "operator") {
      return new Response("Not found", { status: 404 });
    }
    const days = Number(new URL(request.url).searchParams.get("days")) || 7;
    const tool = operatorTools.find((t) => t.name === "traffic_stats")!;
    const data = await tool.execute(env, { days }, ctx);
    return new Response(inlineData(TRAFFIC_WIDGET_HTML, data), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  }

  // A plain GET is what you curl to see which tier you are in.
  if (request.method === "GET") {
    return Response.json({
      name: "decoindex",
      version: "1.0.0",
      protocolVersion: PROTOCOL_VERSION,
      transport: "JSON-RPC 2.0 over HTTP",
      endpoint: "/mcp",
      tier,
      tools: toolsFor(tier).map((t) => t.name),
    });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    return Response.json(error(null, -32600, "Invalid Request"), { status: 400 });
  }
  // A notification has no id and expects no body — `notifications/initialized`
  // arrives from every spec-correct client on connect.
  if (body.id === undefined) return new Response(null, { status: 202 });

  const id = body.id ?? null;
  try {
    return Response.json({ jsonrpc: "2.0", id, result: await dispatch(env, ctx, tier, body) });
  } catch (err) {
    const code = (err as { code?: number }).code ?? -32603;
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(error(id, code, message));
  }
}

async function dispatch(
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
  tier: Tier,
  body: JsonRpcRequest,
): Promise<unknown> {
  const params = body.params ?? {};
  const available = toolsFor(tier);

  switch (body.method) {
    case "initialize":
      return {
        // Echo the client's version when we can speak it at all. A host that
        // asked for an older revision and is answered with a newer one treats
        // the mismatch as fatal and drops the connection.
        protocolVersion:
          typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: {} },
        serverInfo: { name: "decoindex", version: "1.0.0" },
        instructions: tier === "operator" ? OPERATOR_INSTRUCTIONS : PUBLIC_INSTRUCTIONS,
      };

    case "ping":
      return {};

    case "tools/list":
      return {
        tools: available.map(({ name, title, description, inputSchema, outputSchema, annotations, meta }) => ({
          name,
          ...(title ? { title } : {}),
          description,
          inputSchema,
          ...(outputSchema ? { outputSchema } : {}),
          ...(annotations ? { annotations } : {}),
          ...(meta ? { _meta: meta } : {}),
        })),
      };

    case "tools/call": {
      const name = String(params.name ?? "");

      // Host plumbing first, at either tier: Studio runs this handshake before a
      // token has been entered anywhere.
      const host = HOST_TOOLS[name];
      if (host) {
        const out = host();
        return {
          content: [{ type: "text", text: JSON.stringify(out) }],
          structuredContent: out,
          isError: false,
        };
      }

      // Resolved against this tier's list, not the full one: an anonymous caller
      // that guesses `feedback_update` must get "unknown tool", never a 403 that
      // confirms the tool exists — and never the tool.
      const tool = available.find((t) => t.name === name);
      if (!tool) throw rpc(-32601, `Unknown tool: ${name}`);
      const input = (params.arguments ?? {}) as Record<string, unknown>;
      const output = (await tool.execute(env, input, ctx)) as Record<string, unknown>;

      // The read tools return Markdown for the model to read plus a small
      // structured record for it to act on. Sending the Markdown as `content`
      // and everything else as `structuredContent` avoids shipping the document
      // twice in one response.
      const { markdown, ...rest } = output;
      const text = typeof markdown === "string" ? markdown : JSON.stringify(output, null, 2);
      return {
        content: [{ type: "text", text }],
        structuredContent: typeof markdown === "string" ? rest : output,
        isError: false,
      };
    }

    /**
     * Widgets. A host discovers UI by looking for tools that publish an
     * `openai/outputTemplate` and matching it against a `ui://` resource with
     * mimeType `text/html+skybridge` — the URI in the tool and the URI here have
     * to be the same string or the pairing silently does not happen.
     *
     * Listed per tier for the same reason tools are: the traffic screen is an
     * operator surface, and advertising a resource an anonymous caller cannot
     * usefully fill would just be a dead entry in their UI.
     */
    case "resources/list":
      return { resources: resourcesFor(tier) };

    case "resources/read": {
      const uri = String(params.uri ?? "");
      const resource = resourcesFor(tier).find((r) => r.uri === uri);
      if (!resource) throw rpc(-32602, `Unknown resource: ${uri}`);
      return {
        contents: [{ uri, mimeType: resource.mimeType, text: TRAFFIC_WIDGET_HTML }],
      };
    }

    case "prompts/list":
      return { prompts: [] };

    default:
      throw rpc(-32601, `Method not found: ${body.method}`);
  }
}

/**
 * Inline a tool result as `window.__DATA__` for the browser view.
 *
 * `</script>` inside a string literal ends the enclosing script element no
 * matter where it appears, and `<!--` opens a comment; both are how a JSON blob
 * becomes markup. Escaping the `<` is the fix that does not depend on the shape
 * of the data. U+2028/9 are legal in JSON and illegal in a JS string literal.
 */
function inlineData(html: string, data: unknown): string {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return html.replace("<div id=\"root\"></div>", `<div id="root"></div>\n<script>window.__DATA__=${json}</script>`);
}

function rpc(code: number, message: string): Error & { code: number } {
  const e = new Error(message) as Error & { code: number };
  e.code = code;
  return e;
}

function error(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
