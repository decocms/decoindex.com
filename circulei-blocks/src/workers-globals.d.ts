// The binding types circulei/'s sources use, minimal. The full @cloudflare/workers-types globals
// clash with the DOM types TanStack and deco compile against (same choice as shop/src/server/env.ts).
interface KVNamespace {
  get(key: string): Promise<string | null>;
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
interface D1Database {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
}
interface RateLimit {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
}
type IncomingRequestCfProperties = { city?: string; country?: string; latitude?: string; longitude?: string } & Record<string, unknown>;
declare class HTMLRewriter {
  on(selector: string, handlers: { element?(e: { remove(): void }): void; text?(t: { text: string; replace(content: string, opts?: { html: boolean }): void }): void }): HTMLRewriter;
  transform(res: Response): Response;
}
