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

export type ClientClass = "browser" | "preview" | "bot" | "dev";

/**
 * Us: our test scripts send this in their user agent, and a browser marked at /dev carries the
 * cookie. Every event from them logs as ua_class "dev", so the admin can hide its own traffic.
 * utm_source=test is the older test tag, still honoured.
 */
export const DEV_UA = "decoshop-dev";
export function isDev(req: Request): boolean {
  return (
    (req.headers.get("user-agent") ?? "").includes(DEV_UA) ||
    /(?:^|;\s*)decoshop_dev=1(?:;|$)/.test(req.headers.get("cookie") ?? "") ||
    new URL(req.url).searchParams.get("utm_source") === "test"
  );
}

/** Who a non-person is, in words: the name people know and what it is doing here. */
const AGENTS: [RegExp, string, string][] = [
  [/ChatGPT-User/i, "ChatGPT", "alguém pediu ao ChatGPT pra abrir a página"],
  [/OAI-SearchBot/i, "ChatGPT Search", "indexação da busca do ChatGPT"],
  [/GPTBot/i, "GPTBot (OpenAI)", "coleta pra treino de modelo"],
  [/Claude-User/i, "Claude", "alguém pediu ao Claude pra abrir a página"],
  [/Claude-SearchBot|ClaudeBot/i, "Claude (Anthropic)", "indexação / coleta da Anthropic"],
  [/Perplexity-User/i, "Perplexity", "alguém pediu ao Perplexity pra abrir a página"],
  [/PerplexityBot/i, "Perplexity", "indexação da busca do Perplexity"],
  [/Google-InspectionTool|Googlebot|Google-Extended|GoogleOther/i, "Google", "indexação do Google"],
  [/bingbot|BingPreview/i, "Bing", "indexação do Bing (e Copilot)"],
  [/Applebot/i, "Apple", "Siri e Spotlight"],
  [/DuckDuckBot/i, "DuckDuckGo", "indexação"],
  [/YandexBot/i, "Yandex", "indexação"],
  // iMessage previews pose as an old Safari that also names facebookexternalhit and Twitterbot.
  [/iMessage|com\.apple\.Messages|Macintosh; Intel Mac OS X 10_11_1\)/i, "iMessage", "preview de link colado numa conversa"],
  [/WhatsApp/i, "WhatsApp", "preview de link colado numa conversa"],
  [/facebookexternalhit|meta-externalagent/i, "Facebook / Instagram", "preview de link"],
  [/TelegramBot/i, "Telegram", "preview de link colado numa conversa"],
  [/Slackbot/i, "Slack", "preview de link"],
  [/Discordbot/i, "Discord", "preview de link"],
  [/Twitterbot/i, "X / Twitter", "preview de link"],
  [/LinkedInBot/i, "LinkedIn", "preview de link"],
  [/HeadlessChrome|Puppeteer|Playwright|Selenium|PhantomJS/i, "Navegador automatizado", "script controlando um Chrome sem tela"],
  [/Lighthouse|PageSpeed|GTmetrix|Pingdom|Uptime|monitor/i, "Monitor / auditoria", "teste de desempenho ou disponibilidade"],
  [/Ahrefs|Semrush|MJ12bot|DotBot|SEOkicks/i, "Ferramenta de SEO", "rastreando links pra relatório de SEO"],
  [/python|curl|wget|go-http|node-fetch|undici|axios|okhttp|scrapy|java\/|libwww|httpclient/i, "Script", "chamada sem navegador (scraper ou integração)"],
];
export function agentName(ua: string | null): { name: string; what: string } {
  if (!ua) return { name: "Sem user agent", what: "cliente que não se identifica" };
  for (const [re, name, what] of AGENTS) if (re.test(ua)) return { name, what };
  const bot = ua.match(/([A-Za-z][\w-]*bot)\b/i)?.[1];
  return bot ? { name: bot, what: "robô não catalogado" } : { name: "Outro", what: ua.slice(0, 60) };
}

export function clientClass(ua: string | null): ClientClass {
  if (!ua) return "bot";
  if (PREVIEW.test(ua)) return "preview";
  if (BOT.test(ua) || !/mozilla\//i.test(ua)) return "bot";
  return "browser";
}

function pageKind(url: URL): string {
  if (/^\/[cs]\//.test(url.pathname)) return "share";
  if (url.pathname === "/") return url.searchParams.has("q") ? "chat" : "home";
  if (/^\/como-funciona\/?$/.test(url.pathname)) return "about";
  return "missing";
}

/**
 * Paths only vulnerability scanners ask for. Answered with a bare 404 before anything renders or
 * logs: one German IP walked 86 of them in a minute and counted as 86 visitors.
 */
export const SCAN =
  /\.(php\d?|asp|aspx|jsp|cgi|env|ini|sql|bak|old|swp|git|svn|ds_store|log|yml|yaml|conf|config)(\/|$)|\/(wp-[\w-]*|wordpress|xmlrpc|phpmyadmin|pma|cgi-bin|vendor|node_modules|\.git|\.svn|\.aws|\.ssh|actuator|server-status|owa|boaform|hnap1|solr|telescope|debug|console|admin|administrator|backup|setup|install)(\/|$|\.)/i;

/** Pages that exist. Anything else that asks for a document is a typo, an old link or a scanner. */
export function isMissingPage(url: URL): boolean {
  return pageKind(url) === "missing" && !/^\/(dev|mcp|api|go|embed\.js|robots\.txt|sitemap\.xml)(\/|$)/.test(url.pathname) && !SKIP.test(url.pathname);
}

const SKIP = /^\/(api|mcp|go|_serverFn|_build|assets|deco|\.well-known)(\/|$)|\.[a-z0-9]{2,5}$/i;

/** Log a page view in the background. Only real document loads: not assets, APIs or prefetches. */
/**
 * Returns the Set-Cookie to add to the page, if any. Returning visitors are counted with a cookie
 * that holds only the date of the first visit (no identifier): a view whose date is older than
 * today is someone who came back.
 */
export function trackView(req: Request, env: Env, ctx: ExecutionContext): string | null {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  if (SKIP.test(url.pathname)) return null;
  if (!(req.headers.get("accept") ?? "").includes("text/html")) return null;
  if (req.headers.get("purpose") === "prefetch" || req.headers.get("sec-purpose")?.includes("prefetch")) return null;
  const today = new Date().toISOString().slice(0, 10);
  const first = /(?:^|;\s*)ds_first=(\d{4}-\d{2}-\d{2})/.exec(req.headers.get("cookie") ?? "")?.[1];

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
  const cls: ClientClass = isDev(req) ? "dev" : clientClass(ua);
  ctx.waitUntil(
    logEvent(
      env,
      "shop.view",
      null,
      {
        kind: pageKind(url),
        ref,
        cls,
        share: /^\/[cs]\//.test(url.pathname) ? url.pathname.slice(3, 11) : undefined,
        path: pageKind(url) === "missing" ? url.pathname.slice(0, 80) : undefined,
        back: first && first < today ? true : undefined,
        new: first ? undefined : true,
        ua: cls === "browser" ? undefined : ua?.slice(0, 160), // keep bot UAs to see who they are
      },
      undefined,
      { uaClass: cls, country: cf?.country },
    ),
  );
  if (first || cls !== "browser") return null;
  return `ds_first=${today}; Max-Age=63072000; Path=/; Secure; SameSite=Lax`;
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
