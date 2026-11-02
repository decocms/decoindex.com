/**
 * Cloudflare Worker entry. The pages are deco/TanStack's; everything that isn't a page is
 * circulei/'s own Worker, imported as-is, so both versions answer the same APIs:
 *
 *   GET /api/busca?format=json  the stylist's picks as card data (this file: the React grid renders them)
 *   GET /api/*                  circulei/ (stylist note)
 *   ALL /deck, /deck/*          circulei/ (password-gated deck and its images)
 *   cron                        circulei/ (hourly catalog snapshot)
 */
import "./setup";
import "./server/admin-setup";
import "./server/section-loaders";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { createDecoWorkerEntry } from "@decocms/tanstack";
import { handleMeta, handleDecofileRead, handleDecofileReload, handleRender, corsHeaders } from "@decocms/blocks-admin";
import circulei, { search } from "../../circulei/src/index";
import type { Env } from "../../circulei/src/env";
import { card, ctxFor } from "./server/view.server";

const decoWorker = createDecoWorkerEntry(createServerEntry({ fetch: handler.fetch }), {
  admin: { handleMeta, handleDecofileRead, handleDecofileReload, handleRender, corsHeaders },
  securityHeaders: {
    "Content-Security-Policy": [
      "default-src 'self' https: data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
      // Product photos are hotlinked from Circulei's Shopify CDN, never rehosted.
      "img-src 'self' https: data: blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
});

const COOKIE = "circulei_cidade";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/api/busca" && url.searchParams.get("format") === "json") {
      const site = req.headers.get("sec-fetch-site");
      if (site && site !== "same-origin") return new Response("forbidden", { status: 403 });
      const q = (url.searchParams.get("q") ?? "").slice(0, 200).trim();
      if (!q) return new Response("", { status: 400 });
      const ip = req.headers.get("cf-connecting-ip") ?? "?";
      if (env.SEARCH_LIMIT && !(await env.SEARCH_LIMIT.limit({ key: ip })).success) return new Response("devagar", { status: 429 });
      const c = await ctxFor(req);
      const { picks, fallback } = await search(env, c, q);
      const near = c.hub ? picks.filter((p) => p.hub === c.hub!.city).length : 0;
      return Response.json({ picks: picks.map((p) => card(p, c)), near, fallback, hub: c.hub?.city ?? null }, { headers: { "cache-control": "private, no-store" } });
    }
    if (path.startsWith("/api/") || path === "/deck" || path.startsWith("/deck/") || path === "/robots.txt") return circulei.fetch(req, env, ctx);

    let res = await decoWorker.fetch(req, env as never, ctx);
    // The framework preloads the ~200 KB of hydration JS from <head> at high priority, so on a slow
    // phone it competes with the hero photo. The page is fully server-rendered and works before
    // hydration, so the JS can wait: it still loads, from the module script at the end of <body>.
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      // Hydration itself waits for the window's load event (the photos above the fold) and then for an
      // idle moment, so its script evaluation never delays painting the hero photo. Until then the page is server HTML: links and the search form's GET submit work.
      res = new HTMLRewriter()
        .on('link[rel="modulepreload"]', { element: (e) => e.remove() })
        .on('script[type="module"][async]', {
          text(t) {
            const m = t.text.match(/^import\(("[^"]+")\)$/);
            if (m) t.replace(`(()=>{const go=()=>(window.requestIdleCallback||setTimeout)(()=>import(${m[1]}),{timeout:1500});document.readyState==="complete"?go():addEventListener("load",go,{once:true})})()`, { html: true });
          },
        })
        .transform(res);
    }
    // A city picked from the menu sticks for a year, same as circulei/.
    const pick = url.searchParams.get("cidade");
    if (!pick || !/^[\w-]+$/.test(pick) || req.method !== "GET") return res;
    const out = new Response(res.body, res);
    out.headers.append("set-cookie", `${COOKIE}=${pick}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
    return out;
  },
  scheduled: circulei.scheduled,
};
