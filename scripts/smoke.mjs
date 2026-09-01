#!/usr/bin/env node
// End-to-end check against a running instance. No framework on purpose.
//
//   npm run dev            # in one shell
//   npm run smoke          # in another
//   npm run smoke -- https://decoindex.example.workers.dev
//
// Fails loudly on the things that would make the service useless without
// making it error: an empty variants table, a missing cart link, HTML leaking
// into markdown, or a document big enough that an agent has to paginate it.

import assert from "node:assert/strict";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const MAX_DOC_BYTES = 8_192;

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${name}\n     ${err.message.split("\n")[0]}`);
  }
}

const get = async (path) => {
  const res = await fetch(BASE + path, { headers: { accept: "text/markdown" } });
  return { res, body: await res.text() };
};

/** Facts an agent must never be handed. */
function assertCleanMarkdown(body, path) {
  assert.ok(!/<(script|div|span|p)\b/i.test(body), `${path}: HTML leaked into markdown`);
  assert.ok(
    Buffer.byteLength(body) < MAX_DOC_BYTES,
    `${path}: ${Buffer.byteLength(body)}B exceeds the ${MAX_DOC_BYTES}B budget`,
  );
  assert.match(body, /^---\n/, `${path}: missing frontmatter`);
  assert.match(body, /live_commercial_data: false/, `${path}: missing the evidence boundary`);
}

const VTEX_PDP =
  "/farmrio.com.br/copo-quencher-stanley-destiny-x-farm-rio-887ml-multicolorido-374774-2276/p";
const SHOPIFY_PDP = "/allbirds.com/products/mens-strider-explore";

await check("landing page renders", async () => {
  const { res, body } = await get("/");
  assert.equal(res.status, 200);
  assert.match(body, /decoindex/);
});

await check("service llms.txt advertises the URL swap", async () => {
  const { res, body } = await get("/llms.txt");
  assert.equal(res.status, 200);
  assert.match(body, /decoindex\.com\/\{domain\}/);
});

await check("static assets are not treated as merchant domains", async () => {
  for (const p of ["/favicon.ico", "/apple-touch-icon.png"]) {
    const { res } = await get(p);
    assert.equal(res.status, 404, `${p} should 404, got ${res.status}`);
  }
});

await check("VTEX product: variants, price", async () => {
  const { res, body } = await get(VTEX_PDP);
  assert.equal(res.status, 200);
  assertCleanMarkdown(body, VTEX_PDP);
  assert.match(body, /^type: product$/m);
  // The bug that made every VTEX product render an empty variants table: the
  // attribute columns must actually be populated.
  assert.match(body, /\| tamanho \|/, "variant attribute column missing");
  assert.match(body, /R\$\s?\d/, "no formatted price");
});

/**
 * The journey that matters: land on a listing, pick something in stock, open it,
 * get a cart link. Discovering the product rather than hardcoding one keeps the
 * check honest — a hardcoded handle passes until the item sells out, and then
 * reports a bug that isn't there.
 */
async function journey(listingPath, cartPattern) {
  const { body: listing } = await get(listingPath);
  const inStock = listing
    .split("\n")
    .filter((l) => l.startsWith("|") && /\|\s*yes\s*\|/.test(l))
    .map((l) => l.split("|").at(-2)?.trim())
    .filter((u) => u?.startsWith("http"));
  assert.ok(inStock.length, `${listingPath}: no in-stock products in the listing`);

  const path = new URL(inStock[0]).pathname;
  const { res, body } = await get(path);
  assert.equal(res.status, 200, `${path} did not resolve`);
  assertCleanMarkdown(body, path);
  assert.match(body, /^availability: InStock$/m, `${path}: listing said in stock, product did not`);
  assert.match(body, cartPattern, `${path}: cart link missing on an in-stock product`);
}

await check("VTEX journey: listing -> in-stock product -> cart link", () =>
  journey("/farmrio.com.br/moda-feminina/acessorios", /checkout\/cart\/add\?sku=\d+.*ref=decoindex/),
);

await check("Shopify journey: collection -> in-stock product -> cart link", () =>
  journey("/allbirds.com/collections/mens", /\/cart\/\d+:1\?ref=decoindex/),
);

await check("VTEX listing: total count and pagination", async () => {
  const path = "/farmrio.com.br/moda-feminina/acessorios";
  const { res, body } = await get(path);
  assert.equal(res.status, 200);
  assertCleanMarkdown(body, path);
  assert.match(body, /^total_results: \d+$/m, "total_results missing");
  assert.match(body, /\?page=2/, "next-page link missing");
});

await check("VTEX home lists categories", async () => {
  const { res, body } = await get("/farmrio.com.br/");
  assert.equal(res.status, 200);
  assert.match(body, /^## Categories$/m);
  assert.ok(body.split("\n").filter((l) => l.startsWith("- [")).length > 5, "too few categories");
});

await check("Shopify product: currency detected from meta.json", async () => {
  const { res, body } = await get(SHOPIFY_PDP);
  assert.equal(res.status, 200);
  assertCleanMarkdown(body, SHOPIFY_PDP);
  assert.match(body, /^currency: USD$/m, "meta.json currency not picked up");
  assert.match(body, /^type: product$/m);
});

await check("Shopify tags are words, not characters", async () => {
  const { body } = await get(SHOPIFY_PDP);
  const tags = [...body.matchAll(/^- \*\*tag:\*\* (.*)$/gm)].map((m) => m[1]);
  // tags is a comma-separated string on this endpoint; iterating it yields one
  // claim per letter. A single-character tag is the signature of that bug.
  const singles = tags.filter((t) => t.length <= 1);
  assert.equal(singles.length, 0, `tags split into characters: ${tags.slice(0, 8).join("|")}`);
  // Internal metafield tags are noise an agent can't use.
  assert.ok(!tags.some((t) => t.includes("::") || t.includes("=>")), "internal tags leaked");
});

await check("Shopify collection resolves", async () => {
  const { res, body } = await get("/allbirds.com/collections/mens");
  assert.equal(res.status, 200);
  assert.match(body, /^type: product_list$/m);
});

await check(".json returns the structured document", async () => {
  const { res, body } = await get(SHOPIFY_PDP + ".json");
  assert.equal(res.status, 200);
  const doc = JSON.parse(body);
  assert.equal(doc.kind, "product");
  assert.ok(doc.product.variants.length > 0);
  assert.equal(doc.shop.platform, "shopify");
});

await check("missing product is an honest 404, not an empty 200", async () => {
  const { res, body } = await get("/farmrio.com.br/zzz-definitely-not-a-product/p");
  assert.equal(res.status, 404);
  assert.match(body, /^problem: notfound$/m);
});

await check("unreadable storefront says so instead of guessing", async () => {
  const { res, body } = await get("/lojasrenner.com.br/");
  assert.ok([415, 502].includes(res.status), `expected 415/502, got ${res.status}`);
  assert.match(body, /^problem: (unsupported|blocked)$/m);
});

await check("every mirrored page is noindex and canonicals home", async () => {
  const { res } = await get(VTEX_PDP);
  assert.match(res.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(res.headers.get("link") ?? "", /rel="canonical"/);
  assert.match(res.headers.get("link") ?? "", /farmrio\.com\.br/);
});

await check("second read is served from cache, not the merchant", async () => {
  await get(VTEX_PDP); // warm
  const t0 = Date.now();
  const { res } = await get(VTEX_PDP);
  const ms = Date.now() - t0;
  assert.equal(res.status, 200);
  assert.ok(ms < 150, `cached read took ${ms}ms — it is still hitting the origin`);
});

await check("every page tells the reader how to report it", async () => {
  const { body } = await get(VTEX_PDP);
  assert.match(body, /Something wrong on this page/, "no feedback prompt");
  // Documents embed PUBLIC_ORIGIN, not whichever host served them — the same
  // cached document is valid through the custom domain and through workers.dev.
  assert.match(body, /https:\/\/[\w.-]+\/feedback/, "no feedback endpoint in the footer");
});

await check("unclaimed storefronts carry the decocms note", async () => {
  const { body } = await get(VTEX_PDP);
  assert.match(body, /About this page/);
  assert.match(body, /decocms\.com/);
});

await check("feedback accepts a report and rejects an empty one", async () => {
  const res = await fetch(BASE + "/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: BASE + VTEX_PDP,
      kind: "other",
      message: "smoke test — ignore. Filed by scripts/smoke.mjs.",
    }),
  });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.ok(id, "no id returned");

  const bad = await fetch(BASE + "/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "broken" }),
  });
  assert.equal(bad.status, 400, "a report with no message should be rejected");
});

await check("the MCP control plane refuses anonymous callers", async () => {
  for (const init of [{}, { headers: { authorization: "Bearer wrong-token" } }]) {
    const res = await fetch(BASE + "/mcp", init);
    assert.ok([401, 503].includes(res.status), `expected 401/503, got ${res.status}`);
  }
});

await check("html points agents at llms.txt", async () => {
  const { body } = await get("/");
  assert.match(body, /rel="llms-txt"/, "no llms-txt link in <head>");
  const res = await fetch(BASE + VTEX_PDP);
  assert.match(res.headers.get("link") ?? "", /rel="llms-txt"/, "no llms-txt Link header");
});

/**
 * Reading the overview triggers brand extraction, which does a partial write to
 * the registry. A partial write used to reset `platform` to 'unknown', after
 * which every product on that domain answered 404. Order matters here: overview
 * first, product second.
 */
await check("a brand write does not break the domain it describes", async () => {
  const overview = await get("/farmrio.com.br/");
  assert.equal(overview.res.status, 200, "overview failed");
  assert.match(overview.body, /^platform: vtex$/m, "platform lost on the overview");

  const listing = await get("/farmrio.com.br/moda-feminina/acessorios");
  assert.equal(listing.res.status, 200, "listing 404'd after the overview was read");
  assert.match(listing.body, /^platform: vtex$/m, "platform reset by the brand write");
  assert.match(listing.body, /^total_results: \d+$/m);
});

/**
 * ChatGPT's browser rejects text/markdown outright and reports the site as
 * broken. Every markdown document goes out as text/plain, for every client and
 * from every cache layer — negotiating per Accept cannot work here because
 * Cloudflare's zone cache ignores Vary.
 */
await check("every client gets a content type it can read", async () => {
  const accepts = [undefined, "*/*", "text/markdown", "text/html,application/xhtml+xml,*/*;q=0.8"];
  for (const accept of accepts) {
    for (const pass of ["cold", "cached"]) {
      const res = await fetch(BASE + VTEX_PDP, { headers: accept ? { accept } : {} });
      const ct = res.headers.get("content-type") ?? "";
      assert.match(ct, /^text\/plain/, `${pass} accept=${accept ?? "(none)"} got ${ct}`);
    }
  }
  const json = await fetch(BASE + VTEX_PDP + ".json");
  assert.match(json.headers.get("content-type") ?? "", /^application\/json/);
});

await check("price_asc really orders the whole category, not just the page", async () => {
  const path = "/farmrio.com.br/moda-feminina/acessorios";
  const { body } = await get(`${path}?sort=price_asc`);
  assert.match(body, /^sort: price_asc$/m, "sort not echoed in frontmatter");

  // The platform lists in-stock before out-of-stock and orders each run on its
  // own, so the price column ascends, restarts, then ascends again. Check each
  // run, not the whole column — asserting one global order fails on correct data.
  const rows = body.split("\n").filter((l) => l.startsWith("| ") && /R\$/.test(l));
  assert.ok(rows.length > 5, "no priced rows to check ordering on");
  const runs = [[], []];
  for (const r of rows) {
    const cells = r.split("|");
    const price = Number(cells[2].replace(/[^\d,]/g, "").replace(",", "."));
    if (Number.isFinite(price) && price > 0) runs[/\byes\b/.test(cells[4]) ? 0 : 1].push(price);
  }
  for (const [i, run] of runs.entries()) {
    const label = i === 0 ? "in-stock" : "out-of-stock";
    assert.deepEqual(run, [...run].sort((a, b) => a - b), `${label} run not ascending: ${run.join(", ")}`);
  }
  assert.ok(runs[0].length, "no in-stock rows returned for price_asc");

  // The whole point: page 1 of an unsorted 133-product category cannot answer
  // "which is cheapest", so the unsorted document has to advertise the option.
  const { body: plain } = await get(path);
  assert.match(plain, /\?sort=price_asc/, "unsorted listing does not advertise sorting");
});

await check("search + price_asc is strictly ordered, not roughly ordered", async () => {
  // VTEX's own OrderByPriceASC is not monotonic against the price it reports —
  // it returned 189.99 before 189.98. The platform picks the set catalog-wide,
  // we order what it gave us, so our table never contradicts its own heading.
  const { body } = await get("/americanas.com/search?q=playstation%205&sort=price_asc");
  assert.match(body, /^sort: price_asc$/m, "sort not echoed");
  const prices = body
    .split("\n")
    .filter((l) => l.startsWith("| ") && /R\$/.test(l) && /\byes\b/.test(l))
    .map((l) => Number(l.split("|")[2].replace(/[^\d,]/g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  assert.ok(prices.length > 3, "not enough in-stock rows to check");
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), `not ascending: ${prices.slice(0, 5).join(", ")}`);
});

await check("a page-local sort says so instead of overclaiming", async () => {
  const { body } = await get("/allbirds.com/collections/mens?sort=price_asc");
  // Shopify cannot order server-side, so the document must not imply it did.
  assert.match(body, /^sorted_within_page: true$/m, "missing the page-local caveat");
  assert.match(body, /within this page only/i, "no prose warning for a page-local order");
});

await check("a big catalogue shows every top-level category", async () => {
  const { res, body } = await get("/americanas.com/");
  assert.equal(res.status, 200);
  assert.match(body, /^\d+ top-level categories, \d+ including subcategories\./m, "no honest count");
  const roots = body.split("\n").filter((l) => l.startsWith("- ["));
  // 46 roots upstream. Depth-first truncation used to show two of them.
  assert.ok(roots.length > 30, `only ${roots.length} roots listed`);
  assert.ok(body.includes("  - ["), "no subcategories nested under roots");
});

/**
 * A category list says how a merchant files things, not what they sell. These
 * two sections are what let an agent decide whether a storefront is worth
 * exploring without opening anything.
 */
await check("VTEX overview carries best sellers and real search demand", async () => {
  const { res, body } = await get("/americanas.com/");
  assert.equal(res.status, 200);
  assert.match(body, /^## Best sellers$/m, "no best sellers section");
  assert.match(body, /^## What shoppers search for here$/m, "no top searches section");
  const rows = body.split("\n").filter((l) => /^\| .+\| (yes|no) \|/.test(l));
  assert.ok(rows.length >= 10, `only ${rows.length} best-seller rows`);
  assert.match(body, /^- .+ — [\d,]+ searches$/m, "search terms carry no volume");
});

/**
 * The overview truncates its tree, so the categories it omits have to be
 * reachable from somewhere. Without this the reader is told "26 more" and given
 * nowhere to go.
 */
await check("a truncated category is reachable from its own page", async () => {
  const { body: home } = await get("/americanas.com/");
  const hint = home.match(/_\d+ more — open \[([^\]]+)\]\((\S+?)\) to see them all\._/);
  assert.ok(hint, "overview truncates without pointing anywhere");

  const { res, body } = await get(new URL(hint[2]).pathname);
  assert.equal(res.status, 200, `${hint[1]} did not resolve`);
  assert.match(body, /^## Subcategories$/m, `${hint[1]} lists no subcategories`);
  const kids = body.split("\n").filter((l) => l.startsWith("- ["));
  assert.ok(kids.length > 5, `only ${kids.length} subcategories listed`);
});

/**
 * Handed the americanas overview, ChatGPT immediately tried
 * /americanas.com/busca/playstation-5 — it inferred VTEX's own search path,
 * and we answered 404. Searching a storefront by its own convention is the
 * first thing an agent reaches for.
 */
await check("a storefront can be searched on its own URL conventions", async () => {
  for (const [path, term] of [
    ["/americanas.com/busca/playstation-5", "playstation 5"],
    ["/americanas.com/search?q=playstation%205", "playstation 5"],
    ["/allbirds.com/search?q=wool%20runner", "wool runner"],
  ]) {
    const { res, body } = await get(path);
    assert.equal(res.status, 200, `${path} -> ${res.status}`);
    assert.match(body, new RegExp(`^# Search: ${term}$`, "m"), `${path}: wrong title`);
    const rows = body.split("\n").filter((l) => /^\| .+\| (yes|no) \|/.test(l));
    assert.ok(rows.length > 0, `${path}: no results`);
  }
});

/**
 * ChatGPT cannot fabricate a URL — it said so plainly, and its own attempt was
 * blocked. It can only follow a link that was on a page it read. So the search
 * terms the overview publishes have to be links, not bare words.
 */
await check("top search terms are followable links", async () => {
  const { body } = await get("/americanas.com/");
  const link = body.match(/^- \[([^\]]+)\]\((\S+?)\) — [\d,]+ searches$/m);
  assert.ok(link, "top searches are not links");

  const { res, body: results } = await get(new URL(link[2]).pathname);
  assert.equal(res.status, 200, `${link[1]} did not resolve`);
  assert.match(results, /^type: product_list$/m);
});

/**
 * An agent cannot build a URL — it can only follow one it was handed. So every
 * affordance the documents describe has to exist as a link: "add ?sort=price_asc"
 * is unusable prose, six rendered links are not.
 */
await check("sort options are links, not documented syntax", async () => {
  const path = "/americanas.com/consoles-e-games/consoles-playstation";
  const { body } = await get(path);
  assert.match(body, /^## Other orders$/m, "no sort links block");
  const links = [...body.matchAll(/^- \[[^\]]+\]\((\S+\?sort=\w+)\)$/gm)].map((m) => m[1]);
  assert.ok(links.length >= 5, `only ${links.length} sort links`);

  const { res, body: sorted } = await get(new URL(links[0]).pathname + new URL(links[0]).search);
  assert.equal(res.status, 200);
  assert.match(sorted, /^sort: \w+$/m, "following a sort link did not sort");
});

/** Scaffolding a merchant left in its public tree is not a category. */
await check("test categories are kept out of the tree", async () => {
  const { body } = await get("/americanas.com/");
  assert.ok(!/integration test/i.test(body), "test categories leaked into the overview");
});

/** Every URL the root index advertises has to actually resolve. */
await check("the examples in llms.txt all work", async () => {
  const { body } = await get("/llms.txt");
  const urls = [...body.matchAll(/^- (https:\/\/\S+?)(?: —|$)/gm)].map((m) => m[1]);
  assert.ok(urls.length >= 4, `only ${urls.length} examples found`);
  for (const u of urls) {
    const { res } = await get(new URL(u).pathname + new URL(u).search);
    assert.equal(res.status, 200, `advertised example is dead: ${u}`);
  }
});

/**
 * Two searches on one storefront are two documents. `q` was missing from the
 * significant-query list, so every search on a domain returned whatever the
 * first search had cached — /search?q=presente answered "Search: playstation 5".
 */
await check("each search query is its own document", async () => {
  const seen = new Map();
  for (const q of ["presente", "chocolate", "playstation 5"]) {
    const { res, body } = await get(`/americanas.com/search?q=${encodeURIComponent(q)}`);
    assert.equal(res.status, 200);
    assert.match(body, new RegExp(`^title: "Search: ${q}"$`, "m"), `q=${q} got the wrong document`);
    assert.match(
      body,
      new RegExp(`^canonical_url: .*q=${encodeURIComponent(q).replace(/%20/g, "(%20|\\+)")}`, "m"),
      `q=${q}: canonical drops the search term`,
    );
    const first = body.split("\n").find((l) => l.startsWith("| ") && !l.startsWith("| Product"));
    assert.ok(!seen.has(first), `q=${q} returned the same first row as ${seen.get(first)}`);
    seen.set(first, q);
  }
});

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
