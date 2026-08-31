import type { Env } from "../env";
import { authorize } from "./auth";
import { toolByName, tools } from "./tools";

/**
 * MCP over JSON-RPC 2.0 on POST /mcp. Enough of the 2024-11-05 spec for deco
 * Studio to discover the tool catalog and call it: initialize, ping, tools/list,
 * tools/call, resources/list, prompts/list. No SSE — request/response only,
 * which is all Studio needs and all a Worker should hold open.
 */

const PROTOCOL_VERSION = "2024-11-05";

const INSTRUCTIONS = [
  "Private control plane for decoindex, the public service that mirrors VTEX and",
  "Shopify storefronts as Markdown for agents.",
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

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  // A plain GET is what you curl to check the gate is up. Still authenticated:
  // the tool catalog names our merchants.
  const auth = authorize(request, env);
  if (!auth.ok) return auth.response;

  if (request.method === "GET") {
    return Response.json({
      name: "decoindex",
      version: "1.0.0",
      transport: "JSON-RPC 2.0 over HTTP",
      endpoint: "/mcp",
      tools: tools.map((t) => t.name),
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
    return Response.json({ jsonrpc: "2.0", id, result: await dispatch(env, body) });
  } catch (err) {
    const code = (err as { code?: number }).code ?? -32603;
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(error(id, code, message));
  }
}

async function dispatch(env: Env, body: JsonRpcRequest): Promise<unknown> {
  const params = body.params ?? {};
  switch (body.method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: {} },
        serverInfo: { name: "decoindex", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      };

    case "ping":
      return {};

    case "tools/list":
      return {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      };

    case "tools/call": {
      const name = String(params.name ?? "");
      const tool = toolByName[name];
      if (!tool) throw rpc(-32601, `Unknown tool: ${name}`);
      const input = (params.arguments ?? {}) as Record<string, unknown>;
      const output = await tool.execute(env, input);
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
        isError: false,
      };
    }

    // Declared as a capability, so answer rather than erroring. No UI bundle yet.
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
