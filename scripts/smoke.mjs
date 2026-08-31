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

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
