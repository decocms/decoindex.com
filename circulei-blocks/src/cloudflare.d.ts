// `env` from the Workers runtime, for server-only modules (the vite plugin resolves the module).
declare module "cloudflare:workers" {
  export const env: import("../../circulei/src/env").Env;
  export function waitUntil(promise: Promise<unknown>): void;
}
