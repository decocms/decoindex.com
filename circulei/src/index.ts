import { rebuild, snapshot, type Piece, type Snapshot } from "./catalog";
import type { Env } from "./env";
import { km } from "./geo";
import { home, lender, notFound, pdp, resultsFragment, type Ctx } from "./html";
import { keywordScores, scoreAll, sha, stylistNote } from "./search";

const COOKIE = "circulei_cidade";

/** The visitor's city: their own pick (query, then cookie), else the hub nearest to where Cloudflare places them. */
function context(req: Request, snap: Snapshot): Ctx {
  const url = new URL(req.url);
  const cf = (req as { cf?: IncomingRequestCfProperties }).cf;
  const lat = Number(cf?.latitude), lng = Number(cf?.longitude);
  const here = cf?.country === "BR" && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, city: (cf?.city as string) ?? null } : null;
  const picked = url.searchParams.get("cidade") ?? req.headers.get("cookie")?.match(new RegExp(`${COOKIE}=([\\w-]+)`))?.[1];
  if (picked === "brasil") return { snap, hub: null, here, chosen: true };
  const byPick = picked ? snap.hubs.find((h) => h.slug === picked) : undefined;
  if (byPick) return { snap, hub: byPick, here, chosen: true };
  // Off-network (or abroad): São Paulo, the biggest market, is the honest default.
  const nearest = here ? [...snap.hubs].sort((a, b) => km(here, a) - km(here, b))[0] : snap.hubs.find((h) => h.city === "São Paulo");
  return { snap, hub: nearest ?? snap.hubs[0] ?? null, here, chosen: false };
}

const html = (body: string, extra: Record<string, string> = {}) =>
  new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "private, max-age=0", ...extra },
  });

async function log(env: Env, req: Request, name: string, meta: Record<string, unknown>) {
  if (!env.DB) return;
  const ua = req.headers.get("user-agent") ?? "";
  const cls = /decoshop-dev/i.test(ua) || new URL(req.url).searchParams.get("utm_source") === "test" ? "dev" : /bot|crawl|spider|preview|fetch/i.test(ua) ? "bot" : "browser";
  try {
    await env.DB.prepare(`INSERT INTO events (ts, name, domain, surface, ua_class, country, ms, meta) VALUES (?, ?, 'circulei.co', 'circulei', ?, ?, NULL, ?)`)
      .bind(new Date().toISOString(), name, cls, ((req as { cf?: { country?: string } }).cf?.country as string) ?? null, JSON.stringify(meta))
      .run();
  } catch (err) {
    console.error("log failed", err);
  }
}

/** Jev scores, cached per ask (they do not depend on the city); ranked with a nudge for pieces nearby. */
async function search(env: Env, ctx: Ctx, q: string): Promise<{ picks: Piece[]; fallback: boolean }> {
  const key = `circulei:q:v1:${await sha(q.toLowerCase().trim())}`;
  let scores = await env.KV.get<Record<string, number>>(key, "json");
  let fallback = false;
  if (!scores) {
    scores = await scoreAll(env, q, ctx.snap.pieces);
    // 6h: pieces added since are unscored (hidden) until the next miss.
    if (scores) await env.KV.put(key, JSON.stringify(scores), { expirationTtl: 6 * 3600 });
    else (scores = keywordScores(q, ctx.snap.pieces)), (fallback = true);
  }
  const floor = fallback ? 0.01 : 1.0;
  const picks = ctx.snap.pieces
    .map((p) => ({ p, s: (scores![p.handle] ?? -1) + (ctx.hub && p.hub === ctx.hub.city ? 0.15 : 0) }))
    .filter((x) => x.s >= floor)
    .sort((a, b) => b.s - a.s)
    .slice(0, 24)
    .map((x) => x.p);
  return { picks, fallback };
}

export default {
  async fetch(req: Request, env: Env, ectx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n");
    if (path === "/favicon.ico") return new Response(null, { status: 204 });

    const snap = await snapshot(env, ectx);
    const ctx = context(req, snap);
    const pick = url.searchParams.get("cidade");
    const setCookie: Record<string, string> = pick
      ? { "set-cookie": `${COOKIE}=${pick === "brasil" ? "brasil" : (ctx.hub?.slug ?? "")}; Path=/; Max-Age=31536000; SameSite=Lax; Secure` }
      : {};

    if (path.startsWith("/api/")) {
      // Paid calls: same-site only, and a per-IP budget in front.
      const site = req.headers.get("sec-fetch-site");
      if (site && site !== "same-origin") return new Response("forbidden", { status: 403 });
      const q = (url.searchParams.get("q") ?? "").slice(0, 200).trim();
      if (!q) return new Response("", { status: 400 });
      if (path === "/api/busca") {
        const ip = req.headers.get("cf-connecting-ip") ?? "?";
        if (env.SEARCH_LIMIT && !(await env.SEARCH_LIMIT.limit({ key: ip })).success) return new Response("devagar", { status: 429 });
        const t = Date.now();
        const { picks, fallback } = await search(env, ctx, q);
        ectx.waitUntil(log(env, req, "circulei.search", { q, hub: ctx.hub?.city ?? "brasil", n: picks.length, fallback, ms: Date.now() - t }));
        return html(resultsFragment(q, picks, ctx, fallback));
      }
      if (path === "/api/nota") {
        const key = `circulei:note:v1:${await sha(`${q.toLowerCase()}|${ctx.hub?.city ?? ""}`)}`;
        const cached = await env.KV.get(key);
        if (cached !== null) return new Response(cached, { headers: { "content-type": "text/plain; charset=utf-8" } });
        const { picks, fallback } = await search(env, ctx, q);
        const note = fallback || !picks.length ? null : await stylistNote(env, q, ctx.hub?.city ?? "algum lugar do Brasil", picks);
        if (note) ectx.waitUntil(env.KV.put(key, note, { expirationTtl: 86_400 }));
        return new Response(note ?? "", { status: note ? 200 : 204, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      return new Response("not found", { status: 404 });
    }

    if (path === "/") {
      ectx.waitUntil(log(env, req, "circulei.view", { page: "home", hub: ctx.hub?.city ?? "brasil", here: ctx.here?.city ?? null, chosen: ctx.chosen }));
      return html(home(ctx), setCookie);
    }
    if (path === "/seja-locadora") {
      ectx.waitUntil(log(env, req, "circulei.view", { page: "lender", here: ctx.here?.city ?? null }));
      return html(lender(ctx), setCookie);
    }
    const handle = path.match(/^\/p\/([^/]+)\/?$/)?.[1];
    if (handle) {
      const p = snap.pieces.find((x) => x.handle === decodeURIComponent(handle));
      if (!p) return new Response(notFound(ctx), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
      ectx.waitUntil(log(env, req, "circulei.view", { page: "pdp", handle: p.handle, hub: ctx.hub?.city ?? "brasil" }));
      // Same size first, then same city: what she could actually wear, from nearby.
      const similar = snap.pieces
        .filter((x) => x.handle !== p.handle)
        .map((x) => ({ x, s: (x.size && x.size === p.size ? 2 : 0) + (ctx.hub && x.hub === ctx.hub.city ? 1 : 0) + (x.brand === p.brand ? 0.5 : 0) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map((y) => y.x);
      return html(pdp(ctx, p, similar), setCookie);
    }
    return new Response(notFound(ctx), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  },

  async scheduled(_: ScheduledController, env: Env) {
    console.log("circulei snapshot", await rebuild(env));
  },
};
