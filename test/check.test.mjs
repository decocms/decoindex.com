// node --import ./scripts/ts-hooks.mjs --test test/   (npm test)
// Unit tests for /check: robots matcher, scoring, SSRF guard, and checkThrough —
// the one function behind GET /check/{domain} and the check_site tool — with
// fetch, the Cache API and KV mocked. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTarget, checkThrough, isBlocked, isPublicHost, parseRobots } from "../src/server/lib/check.ts";
import { renderCheck } from "../src/server/render/markdown.ts";
import { robotsTxt } from "../src/server/lib/robots.ts";

test("robots matcher (cases ported from geo-check/check-site.mjs)", () => {
  const r = parseRobots(
    "User-agent: Googlebot\nUser-agent: bingbot\nAllow: /$\nAllow: /about\nDisallow: /\n\n" +
      "User-agent: GPTBot\nAllow: /\n\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n",
  );
  assert.equal(isBlocked(r, "Googlebot"), false, "Allow: /$ beats Disallow: / for the home");
  assert.equal(isBlocked(r, "Googlebot", "/x"), true, "other paths stay blocked");
  assert.equal(isBlocked(r, "GPTBot"), false);
  assert.equal(isBlocked(r, "CCBot"), true, "path-specific group blocks");
  assert.equal(isBlocked(r, "ClaudeBot"), false, "empty Disallow under * allows everything");
  assert.equal(isBlocked(parseRobots("User-agent: *\nDisallow: /\n"), "PerplexityBot"), true, "* fallback");
  assert.equal(isBlocked(parseRobots(""), "GPTBot"), false, "no robots.txt allows");
});

test("robots matcher merges groups that name the same bot (RFC 9309)", () => {
  const r = parseRobots("User-agent: GPTBot\nAllow: /a\n\nUser-agent: GPTBot\nDisallow: /\n");
  assert.equal(isBlocked(r, "GPTBot"), true);
});

test("our own robots.txt: search engines get the home only, AI agents everything", () => {
  const r = parseRobots(robotsTxt("https://decoindex.com"));
  assert.equal(isBlocked(r, "Googlebot"), false);
  assert.equal(isBlocked(r, "bingbot", "/farmrio.com.br"), true);
  for (const b of ["GPTBot", "Claude-User", "PerplexityBot"]) assert.equal(isBlocked(r, b, "/x"), false, b);
  assert.equal(isBlocked(r, "Amazonbot"), true);
  assert.deepEqual(r.sitemaps, [], "`Sitemap: none` is not a sitemap URL");
});

test("SSRF guard: public domains only", () => {
  for (const bad of ["localhost", "127.0.0.1", "10.0.0.1", "169.254.169.254", "[::1]", "printer.local", "db.internal", "x.home.arpa", "2130706433", "example.test", ""]) {
    assert.equal(checkTarget(bad), null, bad);
  }
  assert.equal(isPublicHost("192.168.0.1"), false);
  assert.equal(checkTarget("https://www.AbacatePay.com/precos"), "abacatepay.com");
  assert.equal(checkTarget("decoindex.com"), "decoindex.com");
});

// ---------------------------------------------------------------- with mocks

const HOME = `<!doctype html><html><head><title>Acme Pay</title>
<meta name="description" content="Pagamentos via Pix">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>
</head><body><h1>Acme</h1><p>${"Receba por Pix com taxa fixa. ".repeat(30)}</p><p>Planos a partir de R$ 0,80. Dúvidas frequentes.</p></body></html>`;

function site(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(init.redirect, "manual", "redirects are followed by hand");
    const r = routes[String(url)];
    if (!r) return new Response("", { status: 404 });
    if (r.redirect) return new Response(null, { status: 301, headers: { location: r.redirect } });
    return new Response(r.body ?? "", { status: r.status ?? 200, headers: r.headers });
  };
  return calls;
}

function harness() {
  const edge = new Map();
  globalThis.caches = {
    default: {
      match: async (req) => edge.get(req.url)?.clone(),
      put: async (req, res) => void edge.set(req.url, res),
    },
  };
  const kv = new Map();
  const env = {
    PUBLIC_ORIGIN: "https://decoindex.com",
    ATTRIBUTION_PARAM: "ref",
    ATTRIBUTION_VALUE: "decoindex",
    CACHE: {
      get: async (k) => (kv.has(k) ? JSON.parse(kv.get(k).v) : null),
      put: async (k, v, o) => void kv.set(k, { v, o }),
    },
  };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  return { env, ctx, kv, edge, settle: () => Promise.all(pending.splice(0)) };
}

test("checkThrough: scores, bounds, and one cache entry for route and tool", async () => {
  const calls = site({
    "https://www.acme.com.br/": { body: HOME },
    "https://www.acme.com.br/robots.txt": {
      body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: https://www.acme.com.br/sm.xml\n",
    },
    "https://www.acme.com.br/llms.txt": { body: "# Acme\n- [Preços](https://www.acme.com.br/precos)\n" },
    "https://www.acme.com.br/sm.xml": { body: "<?xml version='1.0'?><urlset></urlset>" },
  });
  const h = harness();
  const { report, cache } = await checkThrough(h.env, h.ctx, "acme.com.br");
  await h.settle();

  assert.equal(cache, "miss");
  assert.ok(calls.length <= 4, `at most 4 upstream GETs, got ${calls.length}`);
  assert.deepEqual(report.legivel, {
    home_responds: true,
    title_and_meta: true,
    price_in_text: true,
    faq: true,
    text_without_js: true,
  });
  assert.equal(report.pillars.legivel, 25);
  // GPTBot is training: reported, not scored. 25 - 3 (CDN unverifiable).
  assert.deepEqual(report.robots.blocked.training, ["GPTBot"]);
  assert.equal(report.pillars.permitido, 22);
  // llms.txt + pricing link + sitemap + JSON-LD; Organization is not Software/Product.
  assert.equal(report.pillars.entendivel, 20);
  assert.equal(report.subtotal, 67);

  // KV entry expires (a report, not the index), 24h for a good one.
  const [kvEntry] = [...h.kv.values()];
  assert.equal(kvEntry.o.expirationTtl, 86_400);
  assert.equal(h.edge.size, 1);

  // Second call — what the MCP tool does after a GET — is a cache hit, no upstream.
  const before = calls.length;
  const again = await checkThrough(h.env, h.ctx, "acme.com.br");
  assert.equal(again.cache, "edge");
  assert.equal(calls.length, before);
  assert.equal(again.report.subtotal, 67);

  const md = renderCheck(report, { publicOrigin: "https://decoindex.com", attribution: { param: "ref", value: "d" } });
  assert.match(md, /Subtotal: \*\*67\/75\*\*/);
  assert.match(md, /Citado/);
});

test("checkThrough: a 403 home is a finding, a blocked group costs 8, a negative report is short-lived", async () => {
  site({
    "https://www.shy.com/": { status: 403, body: "denied" },
    "https://www.shy.com/robots.txt": { body: "User-agent: ChatGPT-User\nDisallow: /\n" },
  });
  const h = harness();
  const { report } = await checkThrough(h.env, h.ctx, "shy.com");
  await h.settle();
  assert.equal(report.home.status, 403);
  assert.equal(report.pillars.legivel, 0);
  assert.equal(report.pillars.permitido, 25 - 8 - 3);
  assert.equal([...h.kv.values()][0].o.expirationTtl, 600);
  assert.match(renderCheck(report, { publicOrigin: "https://decoindex.com", attribution: { param: "r", value: "d" } }), /refused a non-browser reader \(HTTP 403\)/);
});

test("checkThrough: redirects to http or a private host are not followed", async () => {
  const calls = site({
    "https://www.evil.com/": { redirect: "http://www.evil.com/" },
    "https://evil.com/": { redirect: "https://localhost/admin" },
  });
  const h = harness();
  const { report } = await checkThrough(h.env, h.ctx, "evil.com");
  await h.settle();
  assert.equal(report.home.status, 0);
  assert.ok(!calls.some((u) => u.startsWith("http://") || u.includes("localhost")), calls.join(" "));
});

test("checkThrough: rate limited before any upstream call, and not cached", async () => {
  const calls = site({});
  const h = harness();
  h.env.READ_THROUGH = { limit: async () => ({ success: false }) };
  const { report } = await checkThrough(h.env, h.ctx, "busy.com");
  await h.settle();
  assert.equal(report, null);
  assert.equal(calls.length, 0);
  assert.equal(h.kv.size + h.edge.size, 0);
});
