// `env` from the Workers runtime, for server functions (the vite plugin resolves the module).
declare module "cloudflare:workers" {
  export const env: import("./server/env").Env;
  export function waitUntil(promise: Promise<unknown>): void;
}
