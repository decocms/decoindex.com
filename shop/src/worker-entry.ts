/**
 * Cloudflare Worker entry. Three plain routes sit in front of the deco/TanStack
 * worker; everything else (pages, Studio admin protocol) is the framework's.
 *
 *   POST /api/chat   NDJSON stream: the shopping agent (server/chat.ts)
 *   POST /api/similar NDJSON stream: "mais como este" by category heuristics, no model (server/find.ts)
 *   POST /api/refine  JSON: "Refinar ✨", Jev ranks what the request may mean per dimension (server/refine.ts)
 *   POST /api/event  feedback + small client events, into decoindex's events table
 *   GET  /go         outbound click to a merchant PDP: logged, then 302
 *   ALL  /mcp        admin MCP app: queries, models, CTR (server/admin/*), token-guarded
 *   GET  /embed.js   partner widget for empty-search pages (server/embed.ts)
 */
import "./setup";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { createDecoWorkerEntry } from "@decocms/tanstack";
import { handleMeta, handleDecofileRead, handleDecofileReload, handleRender, corsHeaders } from "@decocms/blocks-admin";
import { handleChat, handleRefine, handleSimilar } from "./server/chat";
import { brandForUrl } from "./server/brands";
import { logEvent } from "./server/events";
import { EMBED_JS } from "./server/embed";
import { handleMcp } from "./server/admin/mcp";
import { fromOurPages, trackView } from "./server/traffic";
import { refreshAllShowcases } from "./server/showcase.server";
import type { Env, ExecutionContext } from "./server/env";

const decoWorker = createDecoWorkerEntry(createServerEntry({ fetch: handler.fetch }), {
  admin: { handleMeta, handleDecofileRead, handleDecofileReload, handleRender, corsHeaders },
  securityHeaders: {
    // Share links open from the admin panel inside Studio's sandboxed iframe, and Chrome refuses
    // (ERR_BLOCKED_BY_RESPONSE) any page with a COOP header in a popup a sandbox opened.
    // The shop opens no cross-origin windows it needs isolating from, so the default COOP goes.
    "Cross-Origin-Opener-Policy": "unsafe-none",
    // Product images are hotlinked from each merchant's own CDN (never rehosted), so img-src is https: wide.
    "Content-Security-Policy": [
      "default-src 'self' https: data: blob:",
      // Cloudflare Web Analytics injects its beacon from here; blocked, it counted nothing.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
      "img-src 'self' https: data: blob:",
      "style-src 'self' 'unsafe-inline' api.fontshare.com",
      "font-src 'self' data: cdn.fontshare.com api.fontshare.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
});

const EVENT_NAMES = new Set(["shop.feedback", "shop.dismiss", "shop.open", "shop.share", "shop.refine", "shop.enrich.shown", "shop.enrich.search", "shop.fav"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Our POST APIs are only for our own pages (cheap bot filter; CHAT_LIMIT still applies).
    if (request.method === "POST" && url.pathname.startsWith("/api/") && !fromOurPages(request)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    // Shared links used to open a separate "Achados" page; a shared turn now opens in the chat itself.
    const legacy = url.pathname.match(/^\/s\/([0-9A-Za-z]{8})\/?$/);
    if (legacy && request.method === "GET") return Response.redirect(`${url.origin}/c/${legacy[1]}${url.search}`, 301);

    if (url.pathname === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
    }
    // The pages worth finding. Chat turns (/c/) stay crawlable (link previews read them) but carry noindex.
    if (url.pathname === "/sitemap.xml") {
      const urls = ["/", "/como-funciona"].map((p) => `<url><loc>${url.origin}${p}</loc></url>`).join("");
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") return handleChat(request, env, ctx);
    if (url.pathname === "/api/similar" && request.method === "POST") return handleSimilar(request, env, ctx);
    if (url.pathname === "/api/refine" && request.method === "POST") return handleRefine(request, env, ctx);

    if (url.pathname === "/api/event" && request.method === "POST") {
      const e = (await request.json().catch(() => null)) as { name?: string; meta?: Record<string, unknown> } | null;
      if (!e?.name || !EVENT_NAMES.has(e.name)) return new Response(null, { status: 400 });
      ctx.waitUntil(logEvent(env, e.name, null, e.meta ?? {}));
      return new Response(null, { status: 204 });
    }

    // One frozen turn, for a chat URL (?s=id) to reopen exactly what was on screen without a new search.
    if (url.pathname === "/api/share" && request.method === "GET") {
      const id = url.searchParams.get("id") ?? "";
      const raw = /^[0-9a-zA-Z]{8}$/.test(id) ? await env.SHARES?.get(`s:${id}`) : null;
      if (!raw) return Response.json({ error: "not found" }, { status: 404 });
      return new Response(raw, { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
    }

    // Admin as an MCP app (token-guarded): add https://shop.decoindex.com/mcp?token=… in deco Studio.
    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) return handleMcp(request, env);

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

    trackView(request, env, ctx);
    return decoWorker.fetch(request, env as never, ctx as never);
  },

  // Cron (wrangler.jsonc): the home's showcase turns over once a day, before anyone wakes up.
  scheduled(_e: unknown, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshAllShowcases().then((n) => console.log("showcases rebuilt", n), (err) => console.error("showcase cron failed", err)));
  },
};
