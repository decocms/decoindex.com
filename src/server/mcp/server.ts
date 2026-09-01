import type { Env } from "../env";
import { authorize, type Tier } from "./auth";
import { tools as operatorTools, type ToolDefinition } from "./tools";
import { publicTools } from "./public";

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
        tools: available.map(({ name, title, description, inputSchema, outputSchema, annotations }) => ({
          name,
          ...(title ? { title } : {}),
          description,
          inputSchema,
          ...(outputSchema ? { outputSchema } : {}),
          ...(annotations ? { annotations } : {}),
        })),
      };

    case "tools/call": {
      const name = String(params.name ?? "");
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

    // Declared as a capability, so answer rather than erroring. No widget bundle
    // is registered yet — when one is, it belongs here as a `ui://` resource
    // with mimeType `text/html+skybridge`, referenced from a tool's
    // `_meta["openai/outputTemplate"]`.
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };

    default:
      throw rpc(-32601, `Method not found: ${body.method}`);
  }
}

function rpc(code: number, message: string): Error & { code: number } {
  const e = new Error(message) as Error & { code: number };
  e.code = code;
  return e;
}

function error(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
