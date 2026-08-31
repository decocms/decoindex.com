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
  READ_THROUGH?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}
