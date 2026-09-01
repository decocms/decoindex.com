#!/usr/bin/env node
/**
 * The decoindex benchmark.
 *
 * Two layers, because they answer two different questions and cost two very
 * different amounts:
 *
 *   Layer 1  free, no auth, ~1 min. Fetch the same product page as raw storefront
 *            HTML and as a decoindex document. Measure bytes, tokens, latency, and
 *            whether the facts are present in the payload at all.
 *
 *   Layer 2  --agents. Spend real money. Give a headless `claude -p` exactly one
 *            URL and one shopping question, once against the storefront and once
 *            against decoindex, and grade the answer against the merchant's own API.
 *
 * Ground truth never comes from decoindex. Both the product to test and the facts
 * to check come from the merchant's own catalog API, so the benchmark cannot grade
 * us against our own output. What it measures is how expensive it is for an agent
 * to recover a fact the merchant already published — not whether we copied it right.
 *
 * Usage:
 *   node bench/run.mjs                       # layer 1 against production
 *   node bench/run.mjs --base http://127.0.0.1:8799
 *   node bench/run.mjs --agents --reps 1     # + agent runs, cheap pass
 *   node bench/run.mjs --agents --reps 3     # + agent runs, the published pass
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRANDS = JSON.parse(readFileSync(join(HERE, "brands.json"), "utf8"));

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (argv[i + 1] ?? true);
};
const BASE = String(flag("base", "https://decoindex.com")).replace(/\/$/, "");
const AGENTS = argv.includes("--agents");
const REPS = Number(flag("reps", 3));
const RUNNER = String(flag("runner", "claude"));
const MODEL = String(flag("model", RUNNER === "opencode" ? "openrouter/anthropic/claude-sonnet-4.5" : "claude-sonnet-5"));
const TASK_NAMES = String(flag("tasks", "pdp,cheapest")).split(",").map((t) => t.trim()).filter(Boolean);
const OUT = String(flag("out", join(HERE, "results", "latest.json")));
const ONLY = flag("only", null);

/** A browser UA for the storefront arm: this is the payload a scraper actually gets. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const FETCH_TIMEOUT = 20_000;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

async function timed(url, headers = {}) {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT), redirect: "follow" });
    const text = await res.text();
    return {
      ok: true,
      ms: Date.now() - t,
      status: res.status,
      bytes: Buffer.byteLength(text),
      contentType: (res.headers.get("content-type") ?? "").split(";")[0],
      text,
    };
  } catch (err) {
    return { ok: false, ms: Date.now() - t, status: 0, bytes: 0, contentType: null, text: "", error: String(err) };
  }
}

// --- ground truth, straight from the merchant -------------------------------
// ponytail: ~40 lines duplicating a sliver of src/server/platform/{vtex,shopify}.ts.
// Deliberate — importing the Worker's TS into plain node needs a loader, and
// deriving truth from our own output would make the whole benchmark circular.
// Import the real resolvers if this ever grows a third platform.

/** VTEX answers on a canonical host a custom storefront cannot intercept. */
const vtexApi = (b) => (b.account ? `https://${b.account}.vtexcommercestable.com.br` : b.origin);

async function truthVtex(b) {
  const list = await timed(
    `${vtexApi(b)}/api/catalog_system/pub/products/search${b.listing}?_from=0&_to=23`,
    { accept: "application/json" },
  );
  // A miss is `200 []`, not 404 — check the payload, never the status.
  const products = safeJson(list.text);
  if (!Array.isArray(products)) return [];

  const out = [];
  for (const p of products) {
    const live = (p.items ?? [])
      .map((it) => ({ it, offer: it.sellers?.[0]?.commertialOffer }))
      .filter(({ offer }) => offer && offer.AvailableQuantity > 0 && offer.IsAvailable !== false);
    if (!live.length) continue;
    // `variations` is an array of property *names*; values live as top-level keys.
    //
    // Group by axis and keep only the widest one. Flattening every axis into one
    // list produces ground truth like ["Preto","M"] — a colour and a size — which
    // an agent correctly answering "which sizes are in stock" can never match.
    const axes = {};
    for (const { it } of live) {
      for (const name of it.variations ?? []) {
        const values = (it[name] ?? []).filter(Boolean).map(String);
        (axes[name] ??= new Set());
        for (const v of values) axes[name].add(v);
      }
    }
    const widest = Object.values(axes).sort((a, b) => b.size - a.size)[0];
    const variants = widest ? [...widest] : [];
    out.push({
      path: `/${p.linkText}/p`,
      title: p.productName,
      priceMinor: Math.round(live[0].offer.Price * 100),
      currency: "BRL",
      variants: [...new Set(variants)],
      totalInListing: products.length,
    });
  }
  return out;
}

async function truthShopify(b) {
  const handleOf = b.listing.replace(/^\/collections\//, "");
  const list = await timed(`${b.origin}/collections/${handleOf}/products.json?limit=24`, {
    accept: "application/json",
  });
  const products = safeJson(list.text)?.products ?? [];
  const out = [];
  for (const p of products) {
    // /collections/{h}/products.json carries `available`; /products/{handle}.json
    // does not. Read availability from whichever field this endpoint actually has.
    const live = (p.variants ?? []).filter((v) => v.available !== false);
    if (!live.length) continue;
    out.push({
      path: `/products/${p.handle}`,
      title: p.title,
      priceMinor: Math.round(Number(live[0].price) * 100),
      currency: "USD",
      variants: [...new Set(live.map((v) => v.title).filter((t) => t && t !== "Default Title"))],
      totalInListing: products.length,
    });
  }
  return out;
}

/**
 * The three cheapest in-stock products in the category, from the merchant's own
 * API with its own price ordering. This is the answer neither arm can get from
 * one unordered page, which is exactly why it is worth asking.
 */
async function truthCheapest(b, n = 3) {
  if (b.platform === "vtex") {
    const res = await timed(
      `${vtexApi(b)}/api/catalog_system/pub/products/search${b.listing}?_from=0&_to=49&O=OrderByPriceASC`,
      { accept: "application/json" },
    );
    const products = safeJson(res.text);
    if (!Array.isArray(products)) return null;
    const prices = [];
    for (const p of products) {
      for (const it of p.items ?? []) {
        const o = it.sellers?.[0]?.commertialOffer;
        if (o && o.AvailableQuantity > 0 && o.IsAvailable !== false) {
          prices.push(Math.round(o.Price * 100));
          break;
        }
      }
    }
    prices.sort((x, y) => x - y);
    return prices.length >= n ? prices.slice(0, n) : null;
  }
  // Shopify cannot order server-side, so read enough pages to be sure the
  // cheapest are among them rather than guessing from page 1.
  const handle = b.listing.replace(/^\/collections\//, "");
  const prices = [];
  for (let page = 1; page <= 4; page++) {
    const res = await timed(
      `${b.origin}/collections/${handle}/products.json?limit=250&page=${page}`,
      { accept: "application/json" },
    );
    const list = safeJson(res.text)?.products ?? [];
    if (!list.length) break;
    for (const p of list) {
      const live = (p.variants ?? []).filter((v) => v.available !== false && v.price);
      if (live.length) prices.push(Math.min(...live.map((v) => Math.round(Number(v.price) * 100))));
    }
    if (list.length < 250) break;
  }
  prices.sort((x, y) => x - y);
  return prices.length >= n ? prices.slice(0, n) : null;
}

/**
 * What actually came back from the storefront for this product URL.
 *
 * Three outcomes, kept apart on purpose. A WAF challenge is a small response and
 * so is a soft 404, and averaging either into "storefront payload size" would
 * quietly invent a flattering number.
 *
 *   ok        the requested product page, with the product in the HTML
 *   js-shell  200 and the right URL, but neither the title nor the price is in
 *             the HTML — the catalog arrives later, by script, from an API
 *   no-price  the product is named in the HTML but its price is not there at all.
 *             Worse than it sounds: the page looks readable, so an agent that
 *             finds any number on it will happily report the wrong one
 *   blocked   a challenge or refusal — the agent never sees a catalog at all
 *   mismatch  200, but the storefront served something else (soft 404)
 */
function siteOutcome(res, gt, facts = null) {
  if (!res.ok) return "error";
  if ([401, 403, 405, 429, 503].includes(res.status)) return "blocked";
  if (/just a moment|cf-browser-verification|attention required|access denied|enable javascript and cookies/i
    .test(res.text.slice(0, 5_000))) return "blocked";
  if (res.status >= 400) return "error";
  const slug = gt.path.replace(/^\//, "").replace(/\/p$/, "");
  const canonical =
    res.text.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] ??
    res.text.match(/property=["']og:url["'][^>]*content=["']([^"']+)/i)?.[1] ??
    null;
  // Only call it a mismatch when the page says which page it is and disagrees.
  if (canonical && !canonical.includes(slug)) return "mismatch";
  if (facts && !facts.title && !facts.price) return "js-shell";
  if (facts && !facts.price) return "no-price";
  return "ok";
}

/**
 * Pick the first candidate whose product page the storefront will actually serve.
 *
 * Needed because several of these brands share one VTEX account across domains
 * (technos / timecenter / eurorelogios all sit on `timecenter`), so a linkText
 * from the account catalog is not guaranteed to resolve on the domain we are
 * measuring. Blaming the merchant for that would be our bug, not theirs.
 *
 * A blocked storefront still counts: ground truth came from the API, and "the
 * storefront refused" is a result, not a missing measurement.
 */
async function pickProduct(b, candidates) {
  for (const gt of candidates.slice(0, 4)) {
    const probe = await timed(`${b.origin}${gt.path}`, { "user-agent": BROWSER_UA });
    const outcome = siteOutcome(probe, gt);
    if (outcome === "ok" || outcome === "blocked") return { gt, outcome };
  }
  return null;
}

const safeJson = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

// --- fact presence ----------------------------------------------------------

/**
 * Is the fact even *in* the payload? This is the honest upper bound on any
 * agent's success, and it costs nothing to compute.
 *
 * Only title and price are checked. Variant names like "P" or "38" match by
 * accident in a megabyte of markup, so a variant-presence number would be noise
 * dressed as evidence. Variants get graded properly in layer 2, where the agent
 * has to actually list them.
 */
function factsPresent(text, gt) {
  const hay = text.toLowerCase().replace(/\s+/g, " ");
  const major = (gt.priceMinor / 100).toFixed(2);
  const forms = [
    String(gt.priceMinor),
    major,
    major.replace(".", ","),
    Number(major).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    Number(major).toLocaleString("en-US", { minimumFractionDigits: 2 }),
  ];
  return {
    title: hay.includes(gt.title.toLowerCase().slice(0, 40)),
    price: forms.some((f) => hay.includes(f.toLowerCase())),
  };
}

/** Exact counts when a key is around, an honest estimate — labelled — when not. */
async function countTokens(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { tokens: Math.round(Buffer.byteLength(text) / 4), estimated: true };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: text.slice(0, 600_000) }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await res.json();
    if (typeof j.input_tokens === "number") return { tokens: j.input_tokens, estimated: false };
  } catch {
    /* fall through to the estimate */
  }
  return { tokens: Math.round(Buffer.byteLength(text) / 4), estimated: true };
}

// --- layer 1 ----------------------------------------------------------------

async function layer1(b, gt) {
  const siteUrl = `${b.origin}${gt.path}`;
  const indexUrl = `${BASE}/${b.domain}${gt.path}`;

  const site = [];
  for (let i = 0; i < 3; i++) site.push(await timed(siteUrl, { "user-agent": BROWSER_UA }));
  const idx = [];
  for (let i = 0; i < 3; i++) idx.push(await timed(indexUrl, { accept: "text/markdown" }));

  const arm = async (runs, url) => {
    const good = runs.filter((r) => r.ok && r.bytes > 0);
    const last = good.at(-1) ?? runs.at(-1);
    const { tokens, estimated } = await countTokens(last.text);
    return {
      url,
      status: last.status,
      contentType: last.contentType,
      bytes: last.bytes,
      tokens,
      tokensEstimated: estimated,
      msFirst: runs[0].ms,
      msWarm: good.length > 1 ? median(good.slice(1).map((r) => r.ms)) : null,
      facts: factsPresent(last.text, gt),
      error: last.error ?? null,
    };
  };

  const siteArm = await arm(site, siteUrl);
  siteArm.outcome = siteOutcome(site.at(-1), gt, siteArm.facts);
  const indexArm = await arm(idx, indexUrl);
  indexArm.outcome = indexArm.status === 200 ? "ok" : "error";
  return { site: siteArm, decoindex: indexArm };
}

// --- layer 2 ----------------------------------------------------------------

/**
 * Two tasks, because one product page is a ceiling.
 *
 * `pdp` is the control: one page, two facts. Any competent extractor passes it on
 * a healthy storefront, and it ties.
 *
 * `cheapest` is the shopping question people actually ask, and it is the one that
 * separates the arms — a category of 500 products hands back 24, so the answer is
 * not on the page either side gives you first. Both arms get the plain category
 * URL and have to work out how to order it. Neither is handed `?sort=`: the
 * decoindex document advertises it in its own body and the storefront has sort
 * links in its HTML, so this measures whether ordering is *discoverable*, which
 * is the actual product difference rather than a head start we granted ourselves.
 */
const TASKS = {
  pdp: {
    label: "price + variants on one product",
    prompt: (url) =>
      [
        "You are answering a shopping question. Use ONLY the page at the URL below.",
        "Fetch it, read it, and answer from what it says. Do not guess and do not use prior knowledge.",
        "",
        `URL: ${url}`,
        "",
        "Question: what is the current price of this product, and which sizes/variants are in stock?",
        "",
        'Reply with ONLY a JSON object, no prose, no code fence: {"price": <number in major units, e.g. 419.90>, "variants": ["..."]}',
        'If the page does not state a price, use {"price": null, "variants": []}.',
      ].join("\n"),
  },
  cheapest: {
    label: "3 cheapest in-stock in a category",
    prompt: (url) =>
      [
        "You are shopping in the category at the URL below. Start there; you may follow links",
        "or query parameters on the same site if you need to. Do not use prior knowledge.",
        "",
        `URL: ${url}`,
        "",
        "Question: what are the 3 CHEAPEST in-stock products in this category?",
        "Be careful: the first page you see is usually not the whole category, and is usually",
        "not ordered by price. Make sure your three are the cheapest in the category, not just",
        "the cheapest on the page in front of you.",
        "",
        'Reply with ONLY a JSON object, no prose, no code fence: {"prices": [<number>, <number>, <number>]}',
        'Prices in major units, ascending. If you cannot determine them, use {"prices": []}.',
      ].join("\n"),
  },
};

/**
 * One headless run, in a deliberately bare environment.
 *
 * `--setting-sources ""` and `--strict-mcp-config` matter more than they look:
 * without them the run inherits whatever MCP servers, skills and CLAUDE.md the
 * operator happens to have, which showed up as ~183k tokens of cached system
 * prompt on the first pass. That is not reproducible on anyone else's machine
 * and it buries the difference we are trying to measure. Runs in a temp cwd for
 * the same reason — no project CLAUDE.md gets picked up.
 */
const CLAUDE_ARGS = (prompt) => [
  "-p", prompt,
  "--output-format", "json",
  "--model", MODEL,
  "--setting-sources", "",
  "--strict-mcp-config",
  "--allowedTools", "WebFetch",
  "--disallowedTools", "Bash", "WebSearch", "Read", "Write", "Edit", "Task", "Glob", "Grep",
  "--permission-mode", "bypassPermissions",
];

/**
 * opencode drives any OpenRouter model through the same shape of loop, which is
 * the point: if the advantage only shows up under one vendor's fetch tool, it is
 * a property of that tool and not of the documents. Auth lives in opencode's own
 * credential store — the harness never sees a key.
 */
const OPENCODE_ARGS = (prompt) => [
  "run", prompt, "--format", "json", "--model", MODEL, "--auto",
];

function opencode(prompt) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(
      "opencode",
      OPENCODE_ARGS(prompt),
      { maxBuffer: 64 * 1024 * 1024, timeout: RUNNER === "opencode" ? 1_800_000 : 300_000, cwd: tmpdir() },
      (err, stdout) => {
        const parsed = safeJson(stdout);
        // opencode emits either an event array or one object; the text we want is
        // the last assistant text part either way.
        const events = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        let answer = null;
        let inTok = 0, outTok = 0, cost = 0, turns = 0;
        for (const e of events) {
          const parts = e?.parts ?? e?.message?.parts ?? [];
          for (const part of Array.isArray(parts) ? parts : []) {
            if (part?.type === "text" && part.text) answer = part.text;
          }
          if (typeof e?.text === "string") answer = e.text;
          const u = e?.tokens ?? e?.usage ?? e?.message?.tokens;
          if (u) {
            inTok += (u.input ?? u.input_tokens ?? 0) + (u.cache?.write ?? 0);
            outTok += u.output ?? u.output_tokens ?? 0;
            turns++;
          }
          if (typeof e?.cost === "number") cost += e.cost;
        }
        resolve({
          ok: Boolean(answer) && !err,
          wallMs: Date.now() - started,
          durationMs: null,
          costUsd: cost || null,
          freshTokens: inTok,
          cachedTokens: 0,
          outputTokens: outTok,
          numTurns: turns || null,
          answer,
          error: err ? String(err).split("\n")[0] : answer ? null : "no answer in opencode output",
          raw: parsed,
        });
      },
    );
  });
}

/** One runner per CLI. Same contract, so the rest of the harness cannot tell them apart. */
const RUNNERS = { claude, opencode };

function claude(prompt) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(
      "claude",
      CLAUDE_ARGS(prompt),
      { maxBuffer: 64 * 1024 * 1024, timeout: RUNNER === "opencode" ? 1_800_000 : 300_000, cwd: tmpdir() },
      (err, stdout) => {
        // --output-format json emits the event stream; the last `result` event
        // carries usage and the final text.
        const parsed = safeJson(stdout);
        const raw = Array.isArray(parsed)
          ? parsed.filter((e) => e?.type === "result").at(-1) ?? null
          : parsed;
        const u = raw?.usage ?? {};
        resolve({
          ok: Boolean(raw && !raw.is_error),
          wallMs: Date.now() - started,
          durationMs: raw?.duration_ms ?? null,
          costUsd: raw?.total_cost_usd ?? null,
          // Split, because they are not the same thing: `fresh` is the document
          // the agent actually had to read, `cached` is harness overhead that is
          // identical in both arms and would flatter neither.
          freshTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
          cachedTokens: u.cache_read_input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          numTurns: raw?.num_turns ?? null,
          answer: raw?.result ?? null,
          error: err ? String(err).split("\n")[0] : raw?.is_error ? "claude reported an error" : null,
          raw,
        });
      },
    );
  });
}

const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, "");

/** Deterministic grading. A reader can re-check any grade against the stored transcript. */
function grade(answer, gt) {
  const m = String(answer ?? "").match(/\{[\s\S]*\}/);
  const parsed = m ? safeJson(m[0]) : null;
  if (!parsed) return { parsed: false, priceOk: false, variantF1: null };

  const priceOk =
    parsed.price != null && Math.abs(Math.round(Number(parsed.price) * 100) - gt.priceMinor) <= 1;

  const got = new Set((parsed.variants ?? []).map(norm).filter(Boolean));
  const want = new Set(gt.variants.map(norm).filter(Boolean));
  // A product with no variants in the catalog cannot be scored on variants:
  // an empty answer would earn a free 1.0 and quietly inflate both arms. null,
  // and excluded from the mean.
  if (want.size === 0) return { parsed: true, priceOk, variantF1: null, got: [...got] };
  let f1 = 0;
  if (got.size) {
    const hit = [...got].filter((v) => want.has(v)).length;
    const precision = hit / got.size;
    const recall = hit / want.size;
    f1 = hit ? (2 * precision * recall) / (precision + recall) : 0;
  }
  return { parsed: true, priceOk, variantF1: Number(f1.toFixed(3)), got: [...got] };
}

/**
 * Grade the category task on prices, not names: the same product is titled
 * differently on a storefront card and in our table, and we are testing whether
 * the agent found the cheapest things, not whether it transcribed a name.
 */
function gradeCheapest(answer, want) {
  const m = String(answer ?? "").match(/\{[\s\S]*\}/);
  const parsed = m ? safeJson(m[0]) : null;
  const got = (parsed?.prices ?? [])
    .map((p) => Math.round(Number(p) * 100))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (!got.length) return { parsed: Boolean(parsed), hit: 0, of: want.length, exact: false, got };
  // Within a cent, and each true price consumed at most once.
  const pool = [...want];
  let hit = 0;
  for (const g of got) {
    const i = pool.findIndex((w) => Math.abs(w - g) <= 1);
    if (i !== -1) { pool.splice(i, 1); hit++; }
  }
  return { parsed: true, hit, of: want.length, exact: hit === want.length && got.length === want.length, got };
}

async function pool(tasks, size) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

// --- main -------------------------------------------------------------------

const brands = ONLY ? BRANDS.filter((b) => b.domain === ONLY) : BRANDS;
if (!brands.length) {
  console.error(`No brand matches --only ${ONLY}`);
  process.exit(1);
}

// WebFetch reaches a local base only intermittently — it fails with "Socket is
// closed" under load and the agent then truthfully reports it could not read the
// page, which the grader scores as a decoindex loss. That is a harness artifact
// scored as a result, so refuse it outright rather than publish it.
if (AGENTS && /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])/.test(BASE)) {
  console.error(
    `Refusing to run --agents against ${BASE}.\n` +
      `WebFetch is unreliable against localhost and scores decoindex as a loss when it fails.\n` +
      `Point --base at a publicly reachable deployment.`,
  );
  process.exit(2);
}

console.log(`decoindex benchmark — base=${BASE} brands=${brands.length}${AGENTS ? ` agents=on model=${MODEL} reps=${REPS}` : ""}`);
if (AGENTS) {
  console.log(`  up to ${brands.length} brands x ${TASK_NAMES.length} tasks x 2 arms x ${REPS} reps\n`);
}

const l1 = [];
const stale = [];
for (const b of brands) {
  process.stdout.write(`  ${b.brand.padEnd(13)} `);
  const candidates = b.platform === "vtex" ? await truthVtex(b) : await truthShopify(b);
  if (!candidates.length) {
    stale.push({ brand: b.brand, domain: b.domain, reason: "no in-stock product in this category via the merchant API" });
    console.log("SKIP — no in-stock product from the merchant API");
    continue;
  }
  const picked = await pickProduct(b, candidates);
  if (!picked) {
    stale.push({ brand: b.brand, domain: b.domain, reason: "no candidate product URL resolved on the storefront" });
    console.log(`SKIP — none of ${Math.min(4, candidates.length)} candidate URLs resolved on the storefront`);
    continue;
  }
  const gt = picked.gt;
  const arms = await layer1(b, gt);
  const cheapest = TASK_NAMES.includes("cheapest") ? await truthCheapest(b) : null;
  l1.push({
    brand: b.brand, domain: b.domain, platform: b.platform, groundTruth: gt,
    category: { site: `${b.origin}${b.listing}`, decoindex: `${BASE}/${b.domain}${b.listing}`, cheapest },
    ...arms,
  });
  const ratio =
    arms.site.outcome === "ok" && arms.decoindex.tokens
      ? `${(arms.site.tokens / arms.decoindex.tokens).toFixed(0)}x`
      : arms.site.outcome;
  console.log(
    `site ${String(Math.round(arms.site.bytes / 1024)).padStart(5)}KB/${String(arms.site.tokens).padStart(7)}tok ` +
      `price=${arms.site.facts.price ? "y" : "n"}  |  ` +
      `index ${String(Math.round(arms.decoindex.bytes / 1024)).padStart(3)}KB/${String(arms.decoindex.tokens).padStart(5)}tok ` +
      `price=${arms.decoindex.facts.price ? "y" : "n"}  |  ${ratio}`,
  );
}

let l2 = [];
if (AGENTS && l1.length) {
  console.log("\nAgent runs. This spends money.\n");
  const run = RUNNERS[RUNNER];
  const jobs = [];
  for (const row of l1) {
    for (const taskName of TASK_NAMES) {
      const task = TASKS[taskName];
      if (!task) continue;
      // Skip the category task where we could not establish what the cheapest
      // actually are — an ungradeable run is spend with nothing to show for it.
      if (taskName === "cheapest" && !row.category.cheapest) continue;
      for (const armName of ["site", "decoindex"]) {
        for (let rep = 0; rep < REPS; rep++) {
          jobs.push(async () => {
            const url = taskName === "cheapest" ? row.category[armName] : row[armName].url;
            const prompt = task.prompt(url);
            const res = await run(prompt);
            const g = !res.ok
              ? { parsed: false, priceOk: false, variantF1: null }
              : taskName === "cheapest"
                ? gradeCheapest(res.answer, row.category.cheapest)
                : grade(res.answer, row.groundTruth);
            const score =
              taskName === "cheapest"
                ? `${g.hit}/${g.of} cheapest${g.exact ? " exact" : ""}`
                : `${g.priceOk ? "price ok " : "price MISS"} f1=${g.variantF1 ?? "n/a"}`;
            console.log(
              `  ${row.brand.padEnd(13)} ${taskName.padEnd(9)} ${armName.padEnd(10)} rep${rep + 1}  ` +
                `${score.padEnd(22)} ${String(res.freshTokens).padStart(7)}tok  ` +
                `$${(res.costUsd ?? 0).toFixed(4)}  ${(res.wallMs / 1000).toFixed(1)}s`,
            );
            const { raw, ...rest } = res;
            mkdirSync(join(dirname(OUT), "runs"), { recursive: true });
            writeFileSync(
              join(dirname(OUT), "runs", `${row.domain}.${taskName}.${armName}.${rep + 1}.json`),
              JSON.stringify(
                { url, runner: RUNNER, model: MODEL, prompt,
                  groundTruth: taskName === "cheapest" ? row.category.cheapest : row.groundTruth,
                  grade: g, result: raw },
                null, 2,
              ),
            );
            return { brand: row.brand, domain: row.domain, task: taskName, arm: armName, rep: rep + 1, ...rest, grade: g };
          });
        }
      }
    }
  }
  console.log(`  ${jobs.length} paid runs via ${RUNNER} (${MODEL})\n`);
  l2 = await pool(jobs, 4);
}

const results = {
  runAt: new Date().toISOString(),
  base: BASE,
  model: AGENTS ? MODEL : null,
  runner: AGENTS ? RUNNER : null,
  tasks: AGENTS ? TASK_NAMES : null,
  reps: AGENTS ? REPS : null,
  tokensExact: Boolean(process.env.ANTHROPIC_API_KEY),
  git: process.env.GIT_SHA ?? null,
  stale,
  layer1: l1,
  layer2: l2,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\nWrote ${OUT}`);

if (l1.length) {
  // Only storefronts that actually served the product get averaged. Challenge
  // pages and soft 404s are counted separately, never folded into the ratio.
  const served = l1.filter((r) => r.site.outcome === "ok");
  const blocked = l1.filter((r) => r.site.outcome === "blocked");
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const siteTok = sum(served.map((r) => r.site.tokens));
  const idxTok = sum(served.map((r) => r.decoindex.tokens));
  const buckets = {};
  for (const r of l1) buckets[r.site.outcome] = (buckets[r.site.outcome] ?? 0) + 1;
  console.log(
    `\nLayer 1: ${l1.length} products — ` +
      Object.entries(buckets).map(([k, n]) => `${n} ${k}`).join(", ") + ".",
  );
  if (served.length) {
    console.log(
      `  Of the ${served.length} served: storefront ${siteTok.toLocaleString()} tokens vs ` +
        `decoindex ${idxTok.toLocaleString()} — ${(siteTok / idxTok).toFixed(0)}x fewer. ` +
        `Price present in storefront HTML ${served.filter((r) => r.site.facts.price).length}/${served.length}, ` +
        `in decoindex ${served.filter((r) => r.decoindex.facts.price).length}/${served.length}.`,
    );
  }
  if (blocked.length) {
    console.log(`  Blocked outright: ${blocked.map((r) => r.domain).join(", ")}`);
  }
}
if (l2.length) {
  for (const t of TASK_NAMES) {
    const rows = l2.filter((r) => r && r.task === t);
    if (!rows.length) continue;
    console.log(`\nLayer 2 — ${TASKS[t].label} (${RUNNER}/${MODEL})`);
    for (const arm of ["site", "decoindex"]) {
      const rs = rows.filter((r) => r.arm === arm);
      if (!rs.length) continue;
      const cost = sumOf(rs, (r) => r.costUsd ?? 0);
      const wall = median(rs.map((r) => r.wallMs)) / 1000;
      const tok = median(rs.map((r) => r.freshTokens));
      if (t === "cheapest") {
        const exact = rs.filter((r) => r.grade.exact).length;
        const hit = sumOf(rs, (r) => r.grade.hit ?? 0);
        const of = sumOf(rs, (r) => r.grade.of ?? 0);
        console.log(
          `  ${arm.padEnd(10)} exact ${exact}/${rs.length}  found ${hit}/${of} of the cheapest  ` +
            `${tok.toLocaleString()} tok  $${cost.toFixed(2)}  ${wall.toFixed(1)}s`,
        );
      } else {
        const scored = rs.filter((r) => r.grade.variantF1 !== null);
        const f1 = scored.length ? sumOf(scored, (r) => r.grade.variantF1) / scored.length : null;
        console.log(
          `  ${arm.padEnd(10)} price ${rs.filter((r) => r.grade.priceOk).length}/${rs.length}  ` +
            `f1 ${f1 === null ? "n/a" : f1.toFixed(2)} (n=${scored.length})  ` +
            `${tok.toLocaleString()} tok  $${cost.toFixed(2)}  ${wall.toFixed(1)}s`,
        );
      }
    }
  }
  console.log(`\nTotal agent spend: $${sumOf(l2.filter(Boolean), (r) => r.costUsd ?? 0).toFixed(2)}`);
}
function sumOf(xs, f) {
  return xs.reduce((a, b) => a + f(b), 0);
}
/** Products with no variants score null and must not drag the mean. */
function meanF1(rs) {
  const scored = rs.filter((r) => r.grade.variantF1 !== null);
  return scored.length ? sumOf(scored, (r) => r.grade.variantF1) / scored.length : null;
}
