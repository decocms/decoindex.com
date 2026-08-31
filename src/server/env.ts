export interface Env {
  /** Registry (which domains exist, which platform) + first-party events. */
  DB: D1Database;
  /** Rendered markdown, stored without a TTL. This *is* the lazy index. */
  CACHE: KVNamespace;

  // Vars
  PUBLIC_ORIGIN: string;
  ATTRIBUTION_PARAM: string;
  ATTRIBUTION_VALUE: string;

  /**
   * Native rate limiter, keyed on merchant domain. Guards invariant 1: nobody
   * gets to use us as an amplifier against a storefront. Optional so local dev
   * and unconfigured deploys degrade instead of crashing.
   */
  READ_THROUGH?: RateLimiter;
  /** Guards the public feedback endpoint, which is unauthenticated by design. */
  FEEDBACK_LIMIT?: RateLimiter;

  /**
   * Shared secret for the private MCP control plane at /mcp. Optional in the
   * type so local dev runs without it — the handler fails closed at runtime.
   *   wrangler secret put MCP_AUTH_TOKEN
   */
  MCP_AUTH_TOKEN?: string;
}

interface RateLimiter {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}
