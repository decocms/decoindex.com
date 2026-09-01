#!/usr/bin/env node
/**
 * One shopping journey, end to end, measured.
 *
 * The per-product benchmark ties on a healthy storefront, because one page with
 * two facts on it has a ceiling. This asks the question a shopper actually asks
 * — "find me the cheapest X in this store and a link to buy it" — and hands the
 * agent nothing but the store's front door. No category, no search URL, no hint
 * that ordering exists. Everything after that, it has to work out.
 *
 * That is the whole point: it measures *discovery*, which is where the storefront
 * and decoindex actually differ. The storefront has a search box and sort links
 * in HTML; decoindex publishes its conventions in the document body. Neither is
 * handed an advantage — both are told only where the store is.
 *
 * Ground truth comes from the merchant's own catalog API, never from us.
 *
 *   node bench/journey.mjs
 *   node bench/journey.mjs --runner opencode --model moonshotai/kimi-k3
 */

import { execFile } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : (argv[i + 1] ?? true);
};
const RUNNER = String(flag("runner", "claude"));
const MODEL = String(flag("model", RUNNER === "opencode" ? "openrouter/moonshotai/kimi-k3" : "claude-sonnet-5"));
const BASE = String(flag("base", "https://decoindex.com")).replace(/\/$/, "");
const REPS = Number(flag("reps", 1));
const SCENARIO_NAME = String(flag("scenario", "americanas-ps5"));

const SCENARIOS = JSON.parse(readFileSync(join(HERE, "scenarios.json"), "utf8"));
const S = SCENARIOS.find((x) => x.name === SCENARIO_NAME);
if (!S) {
  console.error(`No scenario "${SCENARIO_NAME}". Have: ${SCENARIOS.map((x) => x.name).join(", ")}`);
  process.exit(1);
}

const safeJson = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/** The cheapest in-stock match, from the merchant's own API. */
async function groundTruth(s) {
  const url =
    `https://${s.account}.vtexcommercestable.com.br/api/catalog_system/pub/products/search` +
    `?ft=${encodeURIComponent(s.query)}&_from=0&_to=49&O=OrderByPriceASC`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  const list = safeJson(await res.text());
  if (!Array.isArray(list)) return null;
  const rows = [];
  for (const p of list) {
    for (const it of p.items ?? []) {
      const o = it.sellers?.[0]?.commertialOffer;
      if (o && o.AvailableQuantity > 0 && o.IsAvailable !== false) {
        rows.push({ priceMinor: Math.round(o.Price * 100), name: p.productName, slug: p.linkText });
        break;
      }
    }
  }
  rows.sort((a, b) => a.priceMinor - b.priceMinor);
  return rows[0] ?? null;
}

const PROMPT = (root) =>
  [
    `You are shopping on this store: ${root}`,
    "",
    `Task: find the CHEAPEST in-stock ${S.what} this store sells, and give me a link to buy it.`,
    "",
    "Start at that URL and work it out from there. You may fetch any page on that same site.",
    "Do not use prior knowledge and do not guess a price — read it from the store.",
    "Be careful: the first page of results is usually not the whole catalog, and is usually",
    "not ordered by price.",
    "",
    'Reply with ONLY a JSON object, no prose, no code fence:',
    '{"price": <number in reais, e.g. 189.98>, "name": "<product name>", "url": "<link to the product>", "fetches": <how many pages you fetched>}',
  ].join("\n");

const CLAUDE_ARGS = (p) => [
  "-p", p, "--output-format", "json", "--model", MODEL,
  "--setting-sources", "", "--strict-mcp-config",
  "--allowedTools", "WebFetch",
  "--disallowedTools", "Bash", "WebSearch", "Read", "Write", "Edit", "Task", "Glob", "Grep",
  "--permission-mode", "bypassPermissions",
];
// --auto is opencode's equivalent of claude's bypassPermissions: without it the
// run blocks forever waiting for someone to approve the first fetch, which the
// harness records as a 600s timeout and zero tokens.
const OPENCODE_ARGS = (p) => ["run", p, "--format", "json", "--model", MODEL, "--auto"];

/**
 * Codex, the other coding agent people actually have installed.
 *
 * `--ignore-user-config` is the counterpart to Claude's `--setting-sources ""`:
 * without it the run inherits whatever the operator has configured and stops
 * being reproducible. Network is off in the default sandbox, so a fetch task
 * needs full access — the run happens in a temp directory with nothing in it.
 *
 * Codex has no WebFetch equivalent; it shells out to curl. That is a real
 * difference between the two CLIs rather than a flaw in either, and it is part
 * of what this comparison is for.
 */
const CODEX_ARGS = (p, out) => [
  "exec", p,
  "--skip-git-repo-check",
  "--ignore-user-config",
  "--sandbox", "danger-full-access",
  "--output-last-message", out,
];

function exec(cmd, args) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, timeout: RUNNER === "opencode" ? 2_400_000 : 900_000, cwd: tmpdir() }, (err, stdout) => {
      resolve({ wallMs: Date.now() - started, stdout, err: err ? String(err).split("\n")[0] : null });
    });
  });
}

async function run(prompt) {
  if (RUNNER === "codex") {
    // The final answer comes from --output-last-message; stdout carries the
    // rest. Codex bills against a ChatGPT subscription and reports no dollar
    // figure, so cost stays null rather than being invented from a token count
    // at a rate we would be guessing.
    const outFile = join(tmpdir(), `codex-${process.pid}-${Math.round(performance.now())}.txt`);
    const { wallMs, stdout, err } = await exec("codex", CODEX_ARGS(prompt, outFile));
    let answer = null;
    try { answer = readFileSync(outFile, "utf8").trim() || null; } catch { /* no answer written */ }
    const tokens = Number(stdout.match(/tokens used\s*\n\s*([\d,]+)/i)?.[1]?.replace(/,/g, "") ?? 0);
    return {
      wallMs, answer, costUsd: null, inTokens: tokens, outTokens: 0,
      turns: (stdout.match(/^exec$/gm) ?? []).length || null,
      error: err ?? (answer ? null : "no final message written"),
      raw: { stdout: stdout.slice(-4000), tokens },
    };
  }
  if (RUNNER === "claude") {
    const { wallMs, stdout, err } = await exec("claude", CLAUDE_ARGS(prompt));
    const parsed = safeJson(stdout);
    const r = Array.isArray(parsed) ? parsed.filter((e) => e?.type === "result").at(-1) : parsed;
    const u = r?.usage ?? {};
    return {
      wallMs, answer: r?.result ?? null, costUsd: r?.total_cost_usd ?? null,
      inTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outTokens: u.output_tokens ?? 0, turns: r?.num_turns ?? null,
      error: err ?? (r ? null : "no result event"), raw: r,
    };
  }
  const { wallMs, stdout, err } = await exec("opencode", OPENCODE_ARGS(prompt));
  // opencode streams NDJSON — one event object per line, not a JSON array.
  // Parsing the whole blob yields null, which silently reports a run that
  // happened as zero tokens and zero cost.
  const events = stdout.split("\n").map((l) => safeJson(l.trim())).filter(Boolean);
  const parsed = events;
  let answer = null, inTok = 0, outTok = 0, cost = 0, turns = 0;
  for (const e of events) {
    for (const part of e?.parts ?? e?.message?.parts ?? []) {
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
  return {
    wallMs, answer, costUsd: cost || null, inTokens: inTok, outTokens: outTok,
    turns: turns || null, error: err ?? (answer ? null : "no answer"), raw: parsed,
  };
}

/**
 * Verify the answer against the merchant, rather than match it to a precomputed
 * "correct" one.
 *
 * The first version of this graded against the cheapest result of a full-text
 * search, and it marked the better answer wrong: handed only the store root, the
 * agent found an in-stock PS5 game at R$86.90 — real, verified, and cheaper than
 * both the R$189.98 the search said and the R$115.90 the PS5 category said. The
 * catalog is not consistently categorized, so "the cheapest X in this store" has
 * no computable ground truth, and a grader that pretends otherwise is simply a
 * weaker shopper than the thing it is grading.
 *
 * So grade what can actually be checked:
 *   verified — the product it named exists, is in stock, and costs what it said
 *   priceMinor — how cheap the thing it found was, which is comparable across arms
 *
 * An arm that finds nothing scores unverified. An arm that invents a price gets
 * caught by the merchant's own API. Neither needs a global optimum to be fair.
 */
async function grade(answer, s) {
  const m = String(answer ?? "").match(/\{[\s\S]*\}/);
  const p = m ? safeJson(m[0]) : null;
  if (!p) return { parsed: false, verified: false, reason: "no JSON object in the answer" };

  const claimed = Math.round(Number(p.price) * 100);
  const base = {
    parsed: true,
    claimedPrice: Number.isFinite(claimed) ? claimed : null,
    claimedName: p.name ?? null,
    claimedUrl: p.url ?? null,
    claimedFetches: p.fetches ?? null,
  };
  const slug = String(p.url ?? "").match(/\/([^/]+)\/p(?:[?#]|$)/)?.[1];
  if (!slug) return { ...base, verified: false, reason: "no product slug in the URL it gave" };

  const res = await fetch(
    `https://${s.account}.vtexcommercestable.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(slug)}/p`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
  ).catch(() => null);
  const found = safeJson(res ? await res.text() : "")?.[0];
  if (!found) return { ...base, verified: false, reason: "that product does not exist on the merchant API" };

  let live = null;
  for (const it of found.items ?? []) {
    const o = it.sellers?.[0]?.commertialOffer;
    if (o && o.AvailableQuantity > 0 && o.IsAvailable !== false) {
      live = Math.round(o.Price * 100);
      break;
    }
  }
  if (live === null) return { ...base, verified: false, reason: "product exists but is out of stock", realName: found.productName };
  const priceMatches = Math.abs(live - claimed) <= 1;
  return {
    ...base,
    verified: priceMatches,
    reason: priceMatches ? null : `it said ${claimed / 100}, the merchant says ${live / 100}`,
    realPrice: live,
    realName: found.productName,
  };
}

// --- go ----------------------------------------------------------------------

const truth = await groundTruth(S);
if (!truth) {
  console.error("Could not establish ground truth from the merchant API — refusing to grade.");
  process.exit(2);
}
console.log(`journey: ${S.name} — "${S.what}" on ${S.domain}`);
console.log(`runner:  ${RUNNER} / ${MODEL}`);
console.log(`context: full-text search says R$${(truth.priceMinor / 100).toFixed(2)} — but the answer is verified against the merchant, not matched to this.\n`);

const ARMS = {
  site: `https://www.${S.domain}`,
  decoindex: `${BASE}/${S.domain}`,
};

const out = [];
for (const [arm, root] of Object.entries(ARMS)) {
  for (let rep = 1; rep <= REPS; rep++) {
    const res = await run(PROMPT(root));
    const g = await grade(res.answer, S);
    out.push({ arm, rep, root, ...res, grade: g, raw: undefined });
    console.log(
      `  ${arm.padEnd(10)} rep${rep}  ${g.verified ? "verified" : "FAILED  "}  ` +
        `${(g.realPrice ?? g.claimedPrice) ? "R$" + ((g.realPrice ?? g.claimedPrice) / 100).toFixed(2) : "—"}`.padEnd(22) +
        `${String(res.inTokens).padStart(7)} tok  $${(res.costUsd ?? 0).toFixed(4)}  ` +
        `${(res.wallMs / 1000).toFixed(1)}s  ${res.turns ?? "?"} turns` +
        (g.verified ? "" : `  (${g.reason})`),
    );
    mkdirSync(join(HERE, "results", "journeys"), { recursive: true });
    writeFileSync(
      join(HERE, "results", "journeys", `${S.name}.${RUNNER}.${MODEL.replace(/\//g, "_")}.${arm}.${rep}.json`),
      JSON.stringify({ scenario: S, runner: RUNNER, model: MODEL, arm, root, prompt: PROMPT(root), truth, grade: g, result: res.raw }, null, 2),
    );
  }
}

/**
 * Aggregate every journey run ever recorded into one file the page renders.
 * Appended to rather than overwritten, so a second store or a second model adds
 * a row instead of replacing the last result.
 */
const AGG = join(HERE, "results", "journeys.json");
const previous = (() => {
  try {
    return JSON.parse(readFileSync(AGG, "utf8"));
  } catch {
    return [];
  }
})();
const stamp = new Date().toISOString();
const kept = previous.filter(
  (r) => !(r.scenario === S.name && r.runner === RUNNER && r.model === MODEL),
);
for (const r of out) {
  // A run that produced no tokens produced no result: the CLI timed out or never
  // started. Recording it looks identical to "the model failed the task", which
  // is a different and much more damaging claim than "our harness timed out".
  if (!r.inTokens && !r.costUsd) {
    console.log(`  (not recording ${r.arm} rep${r.rep}: no response from the runner — harness failure, not a result)`);
    continue;
  }
  kept.push({
    scenario: S.name,
    store: S.domain,
    what: S.what,
    runner: RUNNER,
    model: MODEL,
    arm: r.arm,
    rep: r.rep,
    runAt: stamp,
    verified: r.grade.verified,
    reason: r.grade.reason ?? null,
    priceMinor: r.grade.realPrice ?? null,
    productName: r.grade.realName ?? null,
    fetches: r.grade.claimedFetches ?? null,
    turns: r.turns,
    inTokens: r.inTokens,
    costUsd: r.costUsd,
    wallMs: r.wallMs,
  });
}
writeFileSync(AGG, JSON.stringify(kept, null, 2));
console.log(`\nAppended to ${AGG}`);

for (const arm of Object.keys(ARMS)) {
  const rs = out.filter((r) => r.arm === arm);
  const mean = (f) => rs.reduce((a, b) => a + (f(b) ?? 0), 0) / rs.length;
  const cheapest = rs.filter((r) => r.grade.verified).map((r) => r.grade.realPrice);
  console.log(
    `${arm.padEnd(10)} ${rs.filter((r) => r.grade.verified).length}/${rs.length} verified  ` +
      `${cheapest.length ? "best R$" + (Math.min(...cheapest) / 100).toFixed(2) : "found nothing"}  ` +
      `${Math.round(mean((r) => r.inTokens)).toLocaleString()} tok  ` +
      `$${mean((r) => r.costUsd).toFixed(4)}  ${(mean((r) => r.wallMs) / 1000).toFixed(1)}s  ` +
      `${mean((r) => r.turns).toFixed(1)} turns`,
  );
}
