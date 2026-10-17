/**
 * Cloudflare Worker entry. Three plain routes sit in front of the deco/TanStack
 * worker; everything else (pages, Studio admin protocol) is the framework's.
 *
 *   POST /api/chat   NDJSON stream: the shopping agent (server/chat.ts)
 *   POST /api/similar NDJSON stream: "mais como este" by category heuristics, no model (server/find.ts)
 *   POST /api/event  feedback + small client events, into decoindex's events table
 *   GET  /go         outbound click to a merchant PDP: logged, then 302
 *   GET  /embed.js   partner widget for empty-search pages (server/embed.ts)
 */
import "./setup";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { createDecoWorkerEntry } from "@decocms/tanstack";
import { handleMeta, handleDecofileRead, handleDecofileReload, handleRender, corsHeaders } from "@decocms/blocks-admin";
import { handleChat, handleSimilar } from "./server/chat";
import { brandForUrl } from "./server/brands";
import { logEvent } from "./server/events";
import { EMBED_JS } from "./server/embed";
import type { Env, ExecutionContext } from "./server/env";

const decoWorker = createDecoWorkerEntry(createServerEntry({ fetch: handler.fetch }), {
  admin: { handleMeta, handleDecofileRead, handleDecofileReload, handleRender, corsHeaders },
  securityHeaders: {
    // Product images are hotlinked from each merchant's own CDN (never rehosted), so img-src is https: wide.
    "Content-Security-Policy": [
      "default-src 'self' https: data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "img-src 'self' https: data: blob:",
      "style-src 'self' 'unsafe-inline' api.fontshare.com",
      "font-src 'self' data: cdn.fontshare.com api.fontshare.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
});

const EVENT_NAMES = new Set(["shop.feedback", "shop.dismiss", "shop.open", "shop.share", "shop.refine"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat" && request.method === "POST") return handleChat(request, env, ctx);
    if (url.pathname === "/api/similar" && request.method === "POST") return handleSimilar(request, env, ctx);

    if (url.pathname === "/api/event" && request.method === "POST") {
      const e = (await request.json().catch(() => null)) as { name?: string; meta?: Record<string, unknown> } | null;
      if (!e?.name || !EVENT_NAMES.has(e.name)) return new Response(null, { status: 400 });
      ctx.waitUntil(logEvent(env, e.name, null, e.meta ?? {}));
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/embed.js") {
      return new Response(EMBED_JS, {
        headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
      });
    }

    if (url.pathname === "/go") {
      const to = url.searchParams.get("u") ?? "";
      const brand = brandForUrl(to); // only roster merchants: no open redirect
      if (!brand) return new Response("unknown destination", { status: 400 });
      ctx.waitUntil(
        logEvent(env, "shop.click", null, { chat: url.searchParams.get("c"), model: url.searchParams.get("m"), id: url.searchParams.get("id") }, brand.domain),
      );
      return Response.redirect(to, 302);
    }

    return decoWorker.fetch(request, env as never, ctx as never);
  },
};
