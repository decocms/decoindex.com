/** Mirrors wrangler.jsonc by hand. Secrets are optional so dev degrades instead of crashing. */
export interface Env {
  /** decoindex itself. Absent in plain `vite dev` — catalog.ts falls back to the public origin. */
  INDEX?: Fetcher;
  DB?: D1Database;
  /** Shared searches: `s:{id}` → Share JSON. */
  SHARES?: KVNamespace;
  CHAT_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };

  CHAT_MODELS: string;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
  ATTRIBUTION_PARAM: string;
  ATTRIBUTION_VALUE: string;

  OPENROUTER_API_KEY?: string;
  CF_AI_GATEWAY_TOKEN?: string;
  /** Guards /mcp (the admin dashboard). Unset = /mcp answers 503, never open. */
  MCP_AUTH_TOKEN?: string;
}

// Minimal binding shapes. The full @cloudflare/workers-types globals clash with
// the Request generics inside @decocms/tanstack's TS source, same as demo-storefront.
export interface Fetcher {
  fetch(input: string | Request | URL, init?: RequestInit): Promise<Response>;
}
export interface D1Database {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }> };
  };
}
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
export interface KVNamespace {
  list?(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}
