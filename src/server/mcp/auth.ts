import type { Env } from "../env";

/**
 * The /mcp endpoint is the private control plane: it reads agent feedback and
 * the traffic that produced it. One shared secret guards it.
 *
 * Fails CLOSED. An unconfigured deployment answers 503 rather than serving the
 * feedback of every merchant to anyone who guesses the path.
 */

const BEARER = "Bearer ";

export function extractToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith(BEARER)) return authorization.slice(BEARER.length).trim() || null;

  const header = request.headers.get("x-mcp-auth")?.trim();
  if (header) return header;

  // deco Studio's "Add MCP Server" dialog stores a URL and nothing else, so the
  // token has to be able to ride in the query string. It is no weaker than the
  // header — both are bearer secrets — but it does land in logs, so it is last.
  try {
    return new URL(request.url).searchParams.get("token")?.trim() || null;
  } catch {
    return null;
  }
}

export type AuthResult = { ok: true } | { ok: false; response: Response };

export function authorize(request: Request, env: Env): AuthResult {
  const expected = env.MCP_AUTH_TOKEN;
  if (!expected) {
    return {
      ok: false,
      response: rpc(503, -32002, "MCP_AUTH_TOKEN is not configured on this deployment."),
    };
  }
  const received = extractToken(request);
  if (!received || !timingSafeEqual(received, expected)) {
    return {
      ok: false,
      response: rpc(
        401,
        -32001,
        "Unauthorized. Send Authorization: Bearer <token>, an x-mcp-auth header, or ?token=<token>.",
      ),
    };
  }
  return { ok: true };
}

function rpc(status: number, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status });
}

/**
 * Compares in time independent of where the first difference falls. Folding the
 * length difference into the accumulator rather than returning early means a
 * wrong-length guess is not distinguishable from a wrong-content one.
 */
export function timingSafeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}
