import type { Env, ExecutionContext } from "./env";
import { logEvent } from "./events";

/**
 * Who is visiting, and from where. One `shop.view` per page load, cookieless:
 * page kind, referrer host, client class and country — enough for "do shares
 * bring people back?" without identifying anyone.
 */

// Link unfurlers: a share being pasted somewhere. Counted, but never as people.
const PREVIEW = /whatsapp|facebookexternalhit|meta-externalagent|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|skypeuripreview|iframely|embedly|pinterest/i;
const BOT =
  /bot\b|bot\/|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|python|curl|wget|go-http|node-fetch|undici|axios|okhttp|scrapy|httpclient|java\/|libwww|lighthouse|pingdom|uptime|monitor|ahrefs|semrush|gptbot|claudebot|perplexity|bytespider/i;

export type ClientClass = "browser" | "preview" | "bot";

export function clientClass(ua: string | null): ClientClass {
  if (!ua) return "bot";
  if (PREVIEW.test(ua)) return "preview";
  if (BOT.test(ua) || !/mozilla\//i.test(ua)) return "bot";
  return "browser";
}

function pageKind(url: URL): string {
  if (url.pathname.startsWith("/s/")) return "share";
  if (url.pathname === "/") return url.searchParams.has("q") ? "chat" : "home";
  return "other";
}

const SKIP = /^\/(api|mcp|go|_serverFn|_build|assets|deco|\.well-known)(\/|$)|\.[a-z0-9]{2,5}$/i;

/** Log a page view in the background. Only real document loads: not assets, APIs or prefetches. */
export function trackView(req: Request, env: Env, ctx: ExecutionContext) {
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (SKIP.test(url.pathname)) return;
  if (!(req.headers.get("accept") ?? "").includes("text/html")) return;
  if (req.headers.get("purpose") === "prefetch" || req.headers.get("sec-purpose")?.includes("prefetch")) return;

  const ua = req.headers.get("user-agent");
  let ref: string | null = url.searchParams.get("utm_source");
  if (!ref) {
    try {
      const r = new URL(req.headers.get("referer") ?? "");
      ref = r.host === url.host ? "interno" : r.host.replace(/^www\./, "");
    } catch {
      ref = null; // direct, or an app (WhatsApp/Instagram in-app browsers send none)
    }
  }
  const cf = (req as Request & { cf?: { country?: string } }).cf;
  ctx.waitUntil(
    logEvent(
      env,
      "shop.view",
      null,
      {
        kind: pageKind(url),
        ref,
        cls: clientClass(ua),
        share: url.pathname.startsWith("/s/") ? url.pathname.slice(3, 11) : undefined,
        ua: clientClass(ua) === "browser" ? undefined : ua?.slice(0, 120), // keep bot UAs to see who they are
      },
      undefined,
      { uaClass: clientClass(ua), country: cf?.country },
    ),
  );
}

/**
 * Our own POST APIs are only called by our own pages. Browsers always send
 * Origin on a cross-context POST and fetch(); naive scripts and scrapers don't.
 * Not a security boundary (Origin can be forged by a determined client) — a
 * cheap filter in front of a paid model call, next to the per-IP CHAT_LIMIT.
 */
export function fromOurPages(req: Request): boolean {
  const host = new URL(req.url).host;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}
