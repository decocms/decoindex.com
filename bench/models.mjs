#!/usr/bin/env node
/**
 * The same shopping question, across models, through a deliberately plain agent.
 *
 * Why not reuse a coding CLI: they all wrap fetching in their own extraction
 * step. Claude Code's WebFetch summarizes server-side before the model sees a
 * byte, which is why the per-product comparison came out roughly even on tokens
 * — the payload difference was absorbed by Anthropic's infrastructure rather
 * than reaching anyone's context. opencode was worse for a different reason: it
 * took minutes per fetch regardless of which model was behind it, so every run
 * hit a timeout and reported nothing.
 *
 * So this is the honest version of what we actually claim. One tool, `fetch_url`,
 * which returns the response body verbatim. Whatever the storefront sends lands
 * in the context window and gets paid for at the going rate. That is what a
 * developer writing their own agent gets, and it is the number the pitch is
 * really about.
 *
 * The key is read from opencode's credential store and never printed.
 *
 *   node bench/models.mjs --brand fila.com.br
 *   node bench/models.mjs --models google/gemini-2.5-flash,openai/gpt-5-mini
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : (argv[i + 1] ?? true);
};

const BASE = String(flag("base", "https://decoindex.com")).replace(/\/$/, "");
const BRAND_LIST = String(flag("brands", flag("brand", "fila.com.br")))
  .split(",").map((x) => x.trim()).filter(Boolean);
const MODELS = String(flag("models", "google/gemini-2.5-flash,openai/gpt-5-mini"))
  .split(",").map((m) => m.trim()).filter(Boolean);
const MAX_TURNS = Number(flag("max-turns", 6));
/**
 * Hard cap on how much of a page can enter the context, so a 5 MB storefront
 * cannot quietly cost dollars. Truncation is recorded and printed, never hidden —
 * an agent that only saw the first half of a page did not really answer.
 */
const MAX_CHARS = Number(flag("max-chars", 400_000));

const KEY = (() => {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    return JSON.parse(readFileSync(join(homedir(), ".local/share/opencode/auth.json"), "utf8"))
      .openrouter?.key ?? null;
  } catch {
    return null;
  }
})();
if (!KEY) {
  console.error("No OpenRouter key. Set OPENROUTER_API_KEY or run `opencode auth login`.");
  process.exit(1);
}

const BRANDS = JSON.parse(readFileSync(join(HERE, "brands.json"), "utf8"));
const TARGETS = BRAND_LIST.map((d) => {
  const b = BRANDS.find((x) => x.domain === d);
  if (!b) {
    console.error(`No brand ${d} in brands.json`);
    process.exit(1);
  }
  return b;
});

const safeJson = (t) => { try { return JSON.parse(t); } catch { return null; } };
const n0 = (x) => x.toLocaleString("en-US");
const vtexApi = (b) => (b.account ? `https://${b.account}.vtexcommercestable.com.br` : b.origin);

/** Ground truth: one in-stock product and its price, from the merchant's own API. */
async function pick(b) {
  const url = b.platform === "vtex"
    ? `${vtexApi(b)}/api/catalog_system/pub/products/search${b.listing}?_from=0&_to=23`
    : `${b.origin}${b.listing}/products.json?limit=24`;
  const raw = safeJson(await (await fetch(url, { headers: { accept: "application/json" } })).text());
  const list = b.platform === "vtex" ? raw : raw?.products;
  if (!Array.isArray(list)) return null;
  for (const p of list) {
    if (b.platform === "vtex") {
      for (const it of p.items ?? []) {
        const o = it.sellers?.[0]?.commertialOffer;
        if (o && o.AvailableQuantity > 0 && o.IsAvailable !== false) {
          return { path: `/${p.linkText}/p`, title: p.productName, priceMinor: Math.round(o.Price * 100) };
        }
      }
    } else {
      const v = (p.variants ?? []).find((x) => x.available !== false && x.price);
      if (v) return { path: `/products/${p.handle}`, title: p.title, priceMinor: Math.round(Number(v.price) * 100) };
    }
  }
  return null;
}

const TOOLS = [{
  type: "function",
  function: {
    name: "fetch_url",
    description: "Fetch a URL and return the response body exactly as received.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Absolute URL to fetch" } },
      required: ["url"],
    },
  },
}];

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function fetchUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": BROWSER_UA, accept: "text/html,text/plain,*/*" },
      signal: AbortSignal.timeout(30_000),
      redirect: "follow",
    });
    const body = await res.text();
    if (body.length > MAX_CHARS) {
      return {
        text: body.slice(0, MAX_CHARS) +
          `\n\n[truncated by the harness: ${body.length} chars total, first ${MAX_CHARS} shown]`,
        truncated: true, bytes: body.length, status: res.status,
      };
    }
    return { text: body, truncated: false, bytes: body.length, status: res.status };
  } catch (err) {
    return { text: `fetch failed: ${err}`, truncated: false, bytes: 0, status: 0 };
  }
}

const PROMPT = (root, what) =>
  `Answer from this page only: ${root}\n\n` +
  `What is the current price of "${what}", and which sizes/variants are in stock?\n\n` +
  `Fetch the URL, read it, and answer from what it says. Do not guess.\n` +
  `Reply with ONLY this JSON, no prose, no code fence: ` +
  `{"price": <number in major units>, "variants": ["..."]}\n` +
  `If the page does not state a price, use {"price": null, "variants": []}.`;

/** A plain tool-calling loop. Every byte the tool returns is paid for. */
async function agent(model, prompt) {
  const messages = [{ role: "user", content: prompt }];
  let inTok = 0, outTok = 0, cost = 0, turns = 0, fetched = 0, truncated = false, sawBytes = 0;
  const started = Date.now();
  const done = (extra) => ({ inTok, outTok, cost, turns, fetched, truncated, sawBytes, wallMs: Date.now() - started, ...extra });

  for (let i = 0; i < MAX_TURNS; i++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, messages, tools: TOOLS, usage: { include: true } }),
      signal: AbortSignal.timeout(180_000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => JSON.stringify({ error: { message: String(e) } }) }));
    const j = safeJson(await res.text());
    if (!j || j.error) {
      const msg = j?.error?.message ?? `HTTP ${res.status}`;
      // "The page did not fit" is a result, not a malfunction, and it is the
      // sharpest version of the whole argument: several of these storefront
      // pages are larger than the context window of the model asked to read one.
      //
      // Detected structurally, not by matching the message. Three providers
      // phrased the same refusal three ways — "max input length", "should not
      // exceed max_num_tokens", and a bare "Provider returned error" — so the
      // reliable signal is that we handed over a large page and the prompt never
      // grew to hold it.
      const neverArrived = fetched > 0 && sawBytes > 100_000 && inTok < 5_000;
      const saysSo = /context|max.*(input|token)|token.*limit|too (long|large)|exceed|longer than/i.test(msg);
      return done({ ok: false, error: msg, contextOverflow: neverArrived || saysSo });
    }

    turns++;
    inTok += j.usage?.prompt_tokens ?? 0;
    outTok += j.usage?.completion_tokens ?? 0;
    cost += j.usage?.cost ?? 0;

    const msg = j.choices?.[0]?.message;
    if (!msg) return done({ ok: false, error: "no message in the response" });
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      const answer = String(msg.content ?? "").trim();
      // An empty completion after we handed over a document is the provider
      // dropping the tool result, not the model failing the task. Gemini did
      // this on a 690 KB page: 153 prompt tokens, no answer. Scored as a MISS it
      // would read as the storefront arm losing, which is a claim about a
      // storefront we did not actually test. Fail the run instead.
      if (!answer) {
        return done({ ok: false, error: "empty completion — the provider dropped the tool result" });
      }
      // Same failure, quieter: the reply is fine but the document never arrived.
      if (fetched && sawBytes > 20_000 && inTok < 2_000) {
        return done({ ok: false, error: `answered without the page (${n0(sawBytes)} bytes fetched, ${inTok} prompt tokens)` });
      }
      return done({ ok: true, answer });
    }

    for (const call of calls) {
      const args = safeJson(call.function?.arguments ?? "{}") ?? {};
      const r = await fetchUrl(String(args.url ?? ""));
      fetched++;
      truncated = truncated || r.truncated;
      sawBytes += r.bytes;
      // JSON-wrapped, not raw. OpenRouter's Gemini adapter silently drops a
      // plain-string tool result — a 4,490-byte document arrived as 150 prompt
      // tokens and the model correctly answered "I cannot find the price",
      // which would have published as decoindex failing. Wrapping fixes it and
      // costs OpenAI nothing, so both arms and every model get the same shape.
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function?.name ?? "fetch_url",
        content: JSON.stringify({ url: String(args.url ?? ""), status: r.status, body: r.text }),
      });
    }
  }
  return done({ ok: false, error: `hit the ${MAX_TURNS}-turn cap` });
}

const grade = (answer, truth) => {
  const m = String(answer ?? "").match(/\{[\s\S]*\}/);
  const p = m ? safeJson(m[0]) : null;
  if (!p) return { parsed: false, priceOk: false };
  const got = Math.round(Number(p.price) * 100);
  return { parsed: true, priceOk: Number.isFinite(got) && Math.abs(got - truth.priceMinor) <= 1, got };
};

// --- go ----------------------------------------------------------------------

const rows = [];
const stores = [];

for (const B of TARGETS) {
  const truth = await pick(B);
  if (!truth) {
    console.log(`${B.brand}: no in-stock product right now — skipped, nothing to grade against.\n`);
    continue;
  }
  const arms = {
    site: `${B.origin}${truth.path}`,
    decoindex: `${BASE}/${B.domain}${truth.path}`,
  };
  stores.push({ brand: B.brand, domain: B.domain, truth, arms });

  console.log(`${B.brand} — ${truth.title}  (truth ${(truth.priceMinor / 100).toFixed(2)})`);
  for (const model of MODELS) {
    for (const [arm, url] of Object.entries(arms)) {
      const r = await agent(model, PROMPT(url, truth.title));
      const g = r.ok ? grade(r.answer, truth) : { parsed: false, priceOk: false };
      rows.push({ brand: B.brand, domain: B.domain, model, arm, url, ...r, grade: g });
      console.log(
        `  ${model.padEnd(26)} ${arm.padEnd(11)} ${(g.priceOk ? "ok" : "MISS").padEnd(5)} ` +
          `${String(r.inTok).padStart(7)} tok ${("$" + r.cost.toFixed(4)).padStart(9)} ` +
          `${((r.wallMs / 1000).toFixed(1) + "s").padStart(7)}` +
          (r.truncated ? "  [truncated]" : "") + (r.ok ? "" : `  (${r.error})`),
      );
    }
  }
  console.log("");
}

mkdirSync(join(HERE, "results"), { recursive: true });
writeFileSync(
  join(HERE, "results", "models.json"),
  JSON.stringify({ runAt: new Date().toISOString(), stores, rows }, null, 2),
);

console.log("by arm, across every model and store:");
for (const arm of ["site", "decoindex"]) {
  const rs = rows.filter((r) => r.arm === arm);
  if (!rs.length) continue;
  const mean = (f) => rs.reduce((a, b) => a + (f(b) ?? 0), 0) / rs.length;
  console.log(
    `  ${arm.padEnd(10)} ${rs.filter((r) => r.grade.priceOk).length}/${rs.length} correct  ` +
      `${Math.round(mean((r) => r.inTok)).toLocaleString()} tok  $${mean((r) => r.cost).toFixed(4)}  ` +
      `${(mean((r) => r.wallMs) / 1000).toFixed(1)}s`,
  );
}
console.log(`\nTotal spend: $${rows.reduce((a, b) => a + b.cost, 0).toFixed(4)}`);
