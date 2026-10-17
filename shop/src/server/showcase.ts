import { createServerFn } from "@tanstack/react-start";
import type { ShowcaseData, ShowcaseSpec } from "./showcase.server";

export type { ShowcaseData, ShowcaseSpec };

/**
 * Client-safe entry for the home's showcase. Everything that touches the
 * Workers runtime lives in showcase.server.ts and is loaded inside the handler,
 * which the TanStack compiler removes from the client bundle — so the client
 * never tries to resolve `cloudflare:workers`.
 */
export const getShowcase = createServerFn({ method: "POST" })
  .inputValidator((spec: ShowcaseSpec) => spec)
  .handler(async ({ data }) => (await import("./showcase.server")).serveShowcase(data));
