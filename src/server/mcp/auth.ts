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

/**
 * Two tiers on one endpoint.
 *
 * `public` is what an anonymous caller gets: the read tools, which serve exactly
 * what `GET /{domain}/{path}` serves. This tier has to work with no credential
 * at all, because ChatGPT calls `initialize` and `tools/list` before a human has
 * anywhere to type a token — a 401 there does not read as "locked down", it
 * reads as "cannot be installed". That is the bug this replaced.
 *
 * `operator` additionally gets the control plane (feedback triage, traffic
 * stats, probes). That needs the shared secret.
 *
 * A *wrong* token is still 401 rather than a quiet downgrade to `public`. An
 * operator who typo'd their token should be told, not handed a short tool list
 * and left wondering where the rest went.
 */
export type Tier = "public" | "operator";

export type AuthResult = { ok: true; tier: Tier } | { ok: false; response: Response };

export function authorize(request: Request, env: Env): AuthResult {
  const received = extractToken(request);
  if (!received) return { ok: true, tier: "public" };

  // A token was offered, so this caller is asking for the control plane. From
  // here, failing closed is the only correct answer.
  const expected = env.MCP_AUTH_TOKEN;
  if (!expected) {
    return {
      ok: false,
      response: rpc(503, -32002, "MCP_AUTH_TOKEN is not configured on this deployment."),
    };
  }
  if (!timingSafeEqual(received, expected)) {
    return { ok: false, response: rpc(401, -32001, "Unauthorized: that token is not valid.") };
  }
  return { ok: true, tier: "operator" };
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
