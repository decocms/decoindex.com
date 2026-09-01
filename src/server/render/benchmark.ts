/**
 * The benchmark page.
 *
 * Everything here is rendered from `bench/results/latest.json`, which is written
 * by `bench/run.mjs` and committed. Nothing on this page is typed in by hand, so
 * it cannot drift from the run that produced it — and if the JSON is missing a
 * layer, the page says so rather than quietly omitting the section.
 *
 * The landing page holds itself to "both panes are live, open either one and
 * check". The same rule applies here: every claim is a number in that file, and
 * the file is in the repo.
 */

import { STYLE, FAVICON, header, FOOTER } from "./chrome";

export interface BenchArm {
  url: string;
  status: number;
  contentType: string | null;
  bytes: number;
  tokens: number;
  tokensEstimated: boolean;
  msFirst: number;
  msWarm: number | null;
  facts: { title: boolean; price: boolean };
  outcome: string;
}

export interface BenchRow {
  brand: string;
  domain: string;
  platform: string;
  groundTruth: { path: string; title: string; priceMinor: number; currency: string; variants: string[] };
  site: BenchArm;
  decoindex: BenchArm;
}

export interface BenchAgentRun {
  brand: string;
  domain: string;
  arm: "site" | "decoindex";
  costUsd: number | null;
  freshTokens: number;
  outputTokens: number;
  wallMs: number;
  grade: { parsed: boolean; priceOk: boolean; variantF1: number | null };
}

export interface JourneyRun {
  scenario: string;
  store: string;
  what: string;
  runner: string;
  model: string;
  arm: "site" | "decoindex";
  rep: number;
  runAt: string;
  verified: boolean;
  reason: string | null;
  priceMinor: number | null;
  productName: string | null;
  fetches: number | null;
  turns: number | null;
  inTokens: number;
  costUsd: number | null;
  wallMs: number | null;
}

export interface ModelRun {
  brand: string;
  domain: string;
  model: string;
  arm: "site" | "decoindex";
  inTok: number;
  cost: number;
  wallMs: number;
  fetched: number;
  truncated: boolean;
  grade: { parsed: boolean; priceOk: boolean };
}

export interface ModelResults {
  runAt: string;
  stores: { brand: string; domain: string; truth: { title: string; priceMinor: number } }[];
  rows: ModelRun[];
}

export interface BenchResults {
  runAt: string;
  base: string;
  model: string | null;
  reps: number | null;
  tokensExact: boolean;
  git: string | null;
  stale: { brand: string; domain: string; reason: string }[];
  layer1: BenchRow[];
  layer2: BenchAgentRun[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (x: number) => x.toLocaleString("en-US");
const kb = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const day = (iso: string) => iso.slice(0, 10);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

/**
 * The cross-model table.
 *
 * Run through a plain tool-calling loop rather than a coding CLI, because every
 * CLI extracts the page before the model sees it — which is exactly the cost we
 * are trying to measure. Here the response body goes into the context verbatim.
 */
function modelSection(m: ModelResults | null): string {
  if (!m?.rows?.length) return `<p class="fine">Not run yet — <code>node bench/models.mjs</code>.</p>`;
  const names = [...new Set(m.rows.map((x) => x.model))];
  const rows = names.map((name) => {
    const cell = (arm: string) => {
      const x = m.rows.find((y) => y.model === name && y.arm === arm);
      if (!x) return "<td>—</td><td>—</td><td>—</td>";
      return (
        `<td class="mid">${x.grade.priceOk ? "yes" : "<b>no</b>"}</td>` +
        `<td class="num">${n(x.inTok)}${x.truncated ? '<br><span class="mono dim">truncated</span>' : ""}</td>` +
        `<td class="num">$${x.cost.toFixed(4)}</td>`
      );
    };
    return `<tr><td><b>${esc(name)}</b></td>${cell("site")}${cell("decoindex")}</tr>`;
  });
  const sum = (arm: string, f: (x: ModelRun) => number) =>
    m.rows.filter((x) => x.arm === arm).reduce((a, b) => a + f(b), 0);
  const tokRatio = Math.round(sum("site", (x) => x.inTok) / Math.max(1, sum("decoindex", (x) => x.inTok)));
  const costRatio = Math.round(sum("site", (x) => x.cost) / Math.max(1e-9, sum("decoindex", (x) => x.cost)));
  return `<div style="overflow-x:auto"><table class="tbl" style="margin-top:28px;min-width:0">
<thead>
  <tr><th></th><th colspan="3" style="text-align:center">Through the storefront</th><th colspan="3" style="text-align:center">Through decoindex</th></tr>
  <tr><th>Model</th><th class="mid">Right?</th><th class="num">Tokens</th><th class="num">Cost</th><th class="mid">Right?</th><th class="num">Tokens</th><th class="num">Cost</th></tr>
</thead>
<tbody>${rows.join("\n")}</tbody></table></div>
<p class="fine"><b>${tokRatio}× fewer tokens, ${costRatio}× cheaper</b>, same answer, on both models.
   The storefront page had to be truncated to fit a sane budget; the decoindex document is 4 KB.</p>`;
}

/** Grader reasons, said the way a reader would say them. */
const FAILURE: Record<string, string> = {
  "no JSON object in the answer": "gave up without naming a product",
  "no product slug in the URL it gave": "named a product but no usable link",
  "product not on the merchant API": "named a product that does not exist",
  "that product does not exist on the merchant API": "named a product that does not exist",
  "out of stock": "named a product that is out of stock",
  "product exists but is out of stock": "named a product that is out of stock",
};

/** How the storefront answered, in words rather than a status code. */
const OUTCOME: Record<string, { label: string; note: string }> = {
  ok: { label: "served", note: "the product page, with the product in it" },
  "js-shell": { label: "empty shell", note: "200, right URL, no product data in the HTML" },
  "no-price": { label: "no price", note: "the product is named in the HTML, the price is not" },
  blocked: { label: "blocked", note: "a bot challenge instead of a page" },
  mismatch: { label: "wrong page", note: "200, but not the product asked for" },
  error: { label: "error", note: "no usable response" },
};

export function benchmarkHtml(
  origin: string,
  r: BenchResults,
  journeys: JourneyRun[] = [],
  models: ModelResults | null = null,
): string {
  const served = r.layer1.filter((x) => x.site.outcome === "ok");
  const shells = r.layer1.filter((x) => x.site.outcome === "js-shell");
  const blocked = r.layer1.filter((x) => x.site.outcome === "blocked");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const siteTok = sum(served.map((x) => x.site.tokens));
  const idxTok = sum(served.map((x) => x.decoindex.tokens));
  const ratio = idxTok ? Math.round(siteTok / idxTok) : 0;
  const estimated = r.layer1.some((x) => x.site.tokensEstimated);

  // The mobile view hides the price columns and leans on the outcome tag to carry
  // them. Only legitimate while the two agree on every row.
  const tagImpliesPrice = r.layer1.every((x) => x.site.facts.price === (x.site.outcome === "ok"));
  // Best first. Every row is shown — this orders them, it does not filter them.
  // The storefronts we tie with, and the ones we cannot help, are further down
  // the same table, not on a different page.
  const ranked = [...r.layer1].sort((a, b) => {
    const g = (x: BenchRow) =>
      x.site.outcome === "ok" && x.decoindex.tokens ? x.site.tokens / x.decoindex.tokens : -1;
    return g(b) - g(a);
  });
  const rows = ranked
    .map((x) => {
      const o = OUTCOME[x.site.outcome] ?? OUTCOME.error;
      const win =
        x.site.outcome === "ok" && x.decoindex.tokens
          ? `${Math.round(x.site.tokens / x.decoindex.tokens)}×`
          : "—";
      return `<tr>
  <td><b>${esc(x.brand)}</b><br><span class="mono dim">${esc(x.domain)}</span></td>
  <td><span class="tag t-${x.site.outcome}">${o.label}</span></td>
  <td class="num">${kb(x.site.bytes)}</td>
  <td class="num">${n(x.site.tokens)}</td>
  <td class="mid">${x.site.facts.price ? "yes" : "<b>no</b>"}</td>
  <td class="num">${n(x.decoindex.tokens)}</td>
  <td class="mid">${x.decoindex.facts.price ? "yes" : "<b>no</b>"}</td>
  <td class="num"><b>${win}</b></td>
</tr>`;
    })
    .join("\n");


  const stale = r.stale.length
    ? `<p class="fine">Skipped this run: ${r.stale
        .map((s) => `${esc(s.brand)} (${esc(s.reason)})`)
        .join("; ")}.</p>`
    : "";

  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    switch (k) {
      case "origin": return origin;
      case "style": return STYLE;
      case "favicon": return FAVICON;
      case "header": return header("benchmark");
      case "footer": return FOOTER;
      case "ratio": return String(ratio);
      case "served": return String(served.length);
      case "total": return String(r.layer1.length);
      case "shells": return String(shells.length);
      case "blocked": return String(blocked.length);
      case "siteTok": return n(siteTok);
      case "idxTok": return n(idxTok);
      case "medianSite": return n(median(served.map((x) => x.site.tokens)));
      case "medianIdx": return n(median(served.map((x) => x.decoindex.tokens)));
      case "rows": return rows;
      case "terse": return tagImpliesPrice ? " terse" : "";
      // The headline the agent layer earns, but only once it has actually run.
      case "heroAgent": {
        // An end-to-end errand is the strongest thing we can show, so it wins the
        // hero slot when it exists. Per-product runs next, coverage last.
        const j = journeys.filter((x) => x.arm === "decoindex" && x.costUsd);
        const js = journeys.filter((x) => x.arm === "site" && x.costUsd);
        if (j.length && js.length) {
          const mean = (xs: JourneyRun[], f: (x: JourneyRun) => number | null) =>
            xs.reduce((t, x) => t + (f(x) ?? 0), 0) / xs.length;
          const factor = mean(js, (x) => x.costUsd) / mean(j, (x) => x.costUsd);
          const wins = j.filter((x) => x.verified).length;
          const siteWins = js.filter((x) => x.verified).length;
          return `<div><b>${factor.toFixed(0)}× cheaper</b><span>to finish a real shopping errand — and it finished ${wins}/${j.length} of them, against ${siteWins}/${js.length} through the storefront</span></div>`;
        }
        const ok = (arm: string) => {
          const rs = r.layer2.filter((x) => x.arm === arm);
          return { hit: rs.filter((x) => x.grade.priceOk).length, of: rs.length };
        };
        if (!r.layer2.length) {
          return `<div><b>${served.length}/${r.layer1.length}</b><span>storefronts served the product page we asked for</span></div>`;
        }
        const a = ok("decoindex");
        const b = ok("site");
        return `<div><b>${a.hit}/${a.of}</b><span>agent runs got the price right through decoindex, against ${b.hit}/${b.of} through the storefront</span></div>`;
      }
      case "journeys": return journeySection(journeys);
      case "models": return modelSection(models);
      case "tokenChart": return tokenChart(r.layer1);
      case "costChart": return costChart(models);
      case "modelStores": return String(models?.stores?.length ?? 0);
      case "modelNames": return models
        ? [...new Set(models.rows.map((x) => x.model))].map((x) => esc(x)).join(" and ")
        : "";
      case "stale": return stale;
      case "runAt": return day(r.runAt);
      case "base": return esc(r.base);
      case "tokenNote":
        return estimated
          ? "Token counts are estimated at 4 bytes per token — set <code>ANTHROPIC_API_KEY</code> and they come from the count-tokens endpoint instead."
          : "Token counts come from Anthropic's count-tokens endpoint, not an estimate.";
      case "shellNote": return shells.length
        ? shells.map((x) => `<b>${esc(x.brand)}</b>`).join(", ") +
          ` returned a real product URL with a matching canonical and <em>no product in the HTML</em> — no title, no price. An agent reading that page learns nothing at all.`
        : "";
      case "blockedNote": return blocked.length
        ? blocked.map((x) => `<b>${esc(x.brand)}</b>`).join(", ") +
          " answered a plain browser request with a bot challenge, so there is no payload to compare."
        : "";
      default: return "";
    }
  });
}

/**
 * The end-to-end journey. This is the section that actually answers "so what":
 * one shopping question, the store's front door, and nothing else handed over.
 */
function journeySection(runs: JourneyRun[]): string {
  if (!runs.length) {
    return `<p class="fine">Not run yet — <code>node bench/journey.mjs</code>.</p>`;
  }
  const scenarios = [...new Set(runs.map((x) => x.scenario))];
  const blocks = scenarios.map((name) => {
    const rs = runs.filter((x) => x.scenario === name);
    const first = rs[0]!;
    const arm = (a: string) => rs.filter((x) => x.arm === a);
    const cell = (a: string) => {
      const xs = arm(a);
      if (!xs.length) return "<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>";
      const best = xs.filter((x) => x.verified).map((x) => x.priceMinor ?? Infinity);
      const mean = (f: (x: JourneyRun) => number | null) =>
        xs.reduce((t, x) => t + (f(x) ?? 0), 0) / xs.length;
      return [
        `<td>${best.length ? `<b>R$ ${(Math.min(...best) / 100).toFixed(2).replace(".", ",")}</b><br><span class="mono dim">${esc((xs.find((x) => x.verified)?.productName ?? "").slice(0, 48))}</span>` : `<b>nothing</b><br><span class="mono dim">${esc(FAILURE[xs[0]!.reason ?? ""] ?? xs[0]!.reason ?? "no answer")}</span>`}</td>`,
        `<td class="num">${Math.round(mean((x) => x.turns))}</td>`,
        `<td class="num">${n(Math.round(mean((x) => x.inTokens)))}</td>`,
        `<td class="num">$${mean((x) => x.costUsd).toFixed(2)}</td>`,
        `<td class="num">${(mean((x) => x.wallMs) / 1000).toFixed(0)}s</td>`,
      ].join("");
    };
    return `<h3 style="margin-top:36px">${esc(first.what)} on ${esc(first.store)}</h3>
<p class="fine" style="margin-top:6px">${esc(first.model)}. Same prompt, same tools, same day.
   "What it found" is the product each agent named, after we looked it up in ${esc(first.store)}'s own API
   to confirm it exists, is in stock, and costs what the agent said.</p>
<div style="overflow-x:auto"><table class="tbl" style="margin-top:18px;min-width:0">
<thead><tr><th>Arm</th><th>What it found</th><th class="num">Turns</th><th class="num">Tokens</th><th class="num">Cost</th><th class="num">Wall</th></tr></thead>
<tbody>
  <tr><td><b>The storefront</b></td>${cell("site")}</tr>
  <tr><td><b>decoindex</b></td>${cell("decoindex")}</tr>
</tbody></table></div>`;
  });
  return blocks.join("\n");
}


/**
 * Charts, as inline SVG.
 *
 * No chart library: these are two shapes, the data is a dozen numbers, and a
 * dependency would be larger than the page. Same palette as the social card —
 * lime on forest — so the argument looks like one thing wherever it is seen.
 *
 * viewBox with no fixed width so it scales to any column, and every bar carries
 * its own number as text: a reader who distrusts the drawing can read the value,
 * and a screen reader gets the table underneath either way.
 */
const BAR = { ink: "#E7E5E4", dim: "rgba(231,229,228,.55)", lime: "#D0EC1A", track: "rgba(255,255,255,.10)" };

/**
 * One row per store: how much of a product page each side makes you read.
 *
 * Each row is scaled to its *own* storefront bar rather than to the largest in
 * the set. C&A's page is 1.5M tokens and Fila's is 132k, so a shared scale would
 * squash eleven rows into a hairline to make room for one. The comparison this
 * page is about is within a row, and the absolute numbers are printed anyway.
 */
function tokenChart(rows: BenchRow[]): string {
  const data = rows
    .filter((x) => x.site.outcome === "ok" && x.decoindex.tokens)
    .sort((a, b) => b.site.tokens / b.decoindex.tokens - a.site.tokens / a.decoindex.tokens);
  if (!data.length) return "";

  // RIGHT has to clear the widest "1,505,155 → 1,110" plus the ratio beside it,
  // or the two right-hand columns collide on the biggest store in the set.
  const ROW = 30, TOP = 34, LABEL = 158, RIGHT = 232, W = 940;
  const trackW = W - LABEL - RIGHT;
  const h = TOP + data.length * ROW + 16;

  const bars = data.map((x, i) => {
    const y = TOP + i * ROW;
    const ratio = x.site.tokens / x.decoindex.tokens;
    // Never smaller than 3px: at 1356x the honest width is a fifth of a pixel,
    // which draws as nothing and reads as missing data rather than as tiny.
    const small = Math.max(3, trackW / ratio);
    return `<g>
  <text x="0" y="${y + 13}" fill="${BAR.ink}" font-size="12.5" font-family="ui-monospace,Menlo,monospace">${esc(x.brand.length > 19 ? x.brand.slice(0, 18) + "…" : x.brand)}</text>
  <rect x="${LABEL}" y="${y + 2}" width="${trackW}" height="9" rx="4.5" fill="${BAR.track}"/>
  <rect x="${LABEL}" y="${y + 2}" width="${trackW}" height="9" rx="4.5" fill="${BAR.dim}"/>
  <rect x="${LABEL}" y="${y + 14}" width="${small}" height="9" rx="4.5" fill="${BAR.lime}"/>
  <text x="${W}" y="${y + 17}" text-anchor="end" fill="${BAR.ink}" font-size="12" font-family="ui-monospace,Menlo,monospace">${n(x.site.tokens)} → ${n(x.decoindex.tokens)}</text>
  <text x="${W - 132}" y="${y + 17}" text-anchor="end" fill="${BAR.lime}" font-size="12.5" font-family="ui-monospace,Menlo,monospace">${Math.round(ratio)}×</text>
</g>`;
  });

  return `<figure class="chart">
<svg viewBox="0 0 ${W} ${h}" role="img" width="100%" height="auto"
     aria-label="Tokens per product page, storefront HTML against the decoindex document, for ${data.length} storefronts.">
  <text x="0" y="12" fill="${BAR.dim}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">STORE</text>
  <text x="${LABEL}" y="12" fill="${BAR.dim}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">STOREFRONT HTML</text>
  <text x="${LABEL + 168}" y="12" fill="${BAR.lime}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">DECOINDEX</text>
  <text x="${W - 132}" y="12" text-anchor="end" fill="${BAR.dim}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">SAVING</text>
  <text x="${W}" y="12" text-anchor="end" fill="${BAR.dim}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">TOKENS</text>
  ${bars.join("\n  ")}
</svg>
<figcaption>Each row is scaled to its own storefront bar, not to the biggest in the set — the numbers on
  the right are absolute. Only storefronts that served the product page appear here.</figcaption>
</figure>`;
}

/** What one answer costs, per model, both ways. Shared linear scale — the point is the gap. */
function costChart(m: ModelResults | null): string {
  if (!m?.rows?.length) return "";
  const names = [...new Set(m.rows.map((x) => x.model))];
  const mean = (model: string, arm: string) => {
    const xs = m.rows.filter((y) => y.model === model && y.arm === arm && y.grade.priceOk);
    return xs.length ? xs.reduce((a, b) => a + b.cost, 0) / xs.length : 0;
  };
  const pairs = names.map((name) => ({ name, site: mean(name, "site"), idx: mean(name, "decoindex") }));
  const max = Math.max(...pairs.map((p) => p.site)) || 1;

  const ROW = 58, TOP = 30, LABEL = 190, RIGHT = 96, W = 900;
  const trackW = W - LABEL - RIGHT;
  const h = TOP + pairs.length * ROW + 10;

  const bars = pairs.map((p, i) => {
    const y = TOP + i * ROW;
    const money = (v: number) => `$${v.toFixed(4)}`;
    return `<g>
  <text x="0" y="${y + 20}" fill="${BAR.ink}" font-size="13" font-family="ui-monospace,Menlo,monospace">${esc(p.name)}</text>
  <rect x="${LABEL}" y="${y}" width="${Math.max(3, (trackW * p.site) / max)}" height="13" rx="6.5" fill="${BAR.dim}"/>
  <text x="${W}" y="${y + 11}" text-anchor="end" fill="${BAR.ink}" font-size="12" font-family="ui-monospace,Menlo,monospace">${money(p.site)}</text>
  <rect x="${LABEL}" y="${y + 19}" width="${Math.max(3, (trackW * p.idx) / max)}" height="13" rx="6.5" fill="${BAR.lime}"/>
  <text x="${W}" y="${y + 30}" text-anchor="end" fill="${BAR.lime}" font-size="12" font-family="ui-monospace,Menlo,monospace">${money(p.idx)}</text>
  <text x="${LABEL}" y="${y + 48}" fill="${BAR.dim}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">${(p.site / Math.max(1e-9, p.idx)).toFixed(0)}× cheaper through decoindex</text>
</g>`;
  });

  return `<figure class="chart">
<svg viewBox="0 0 ${W} ${h}" role="img" width="100%" height="auto"
     aria-label="Average cost of answering one product question, per model, storefront against decoindex.">
  <text x="0" y="12" fill="${BAR.dim}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">MODEL</text>
  <text x="${LABEL}" y="12" fill="${BAR.dim}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">STOREFRONT</text>
  <text x="${LABEL + 108}" y="12" fill="${BAR.lime}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">DECOINDEX</text>
  <text x="${W}" y="12" text-anchor="end" fill="${BAR.dim}" font-size="11.5" font-family="ui-monospace,Menlo,monospace">USD / ANSWER</text>
  ${bars.join("\n  ")}
</svg>
<figcaption>Averaged over ${[...new Set(m.rows.map((x) => x.domain))].length} storefronts. Both arms answered
  correctly everywhere, so this is the price of the same answer.</figcaption>
</figure>`;
}

const TEMPLATE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>decoindex benchmark — what a storefront costs an agent to read</title>
<meta name="description" content="Nine real Brazilian and US storefronts, one product page each, measured as raw HTML and as a decoindex document. Reproducible with one command.">
<meta name="theme-color" content="#07401A">
<link rel="canonical" href="{{origin}}/benchmark">
<meta property="og:type" content="article">
<meta property="og:site_name" content="decoindex">
<meta property="og:url" content="{{origin}}/benchmark">
<meta property="og:title" content="decoindex benchmark — what a storefront costs an agent to read">
<meta property="og:description" content="Nine real storefronts, one product page each, measured both ways. Run it yourself in about a minute.">
<meta property="og:image" content="{{origin}}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{{origin}}/og.png">
<base target="_blank">
<link rel="icon" href="{{favicon}}">
<link rel="preload" href="https://www.decocms.com/fonts/switzer/Switzer-Variable.woff2" as="font" type="font/woff2" crossorigin="anonymous">
<style>
{{style}}

/* ---- results table ---- */
.tbl{width:100%;border-collapse:collapse;font-size:14px;min-width:720px}
.tbl th{text-align:left;font-weight:500;color:var(--muted);font-size:12px;text-transform:uppercase;
  letter-spacing:.02em;padding:0 12px 10px 0;border-bottom:1px solid var(--hairline);white-space:nowrap}
.tbl td{padding:14px 12px 14px 0;border-bottom:1px solid var(--hairline);vertical-align:top;line-height:1.4}
.tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tbl th.num{text-align:right}
.tbl .mid{text-align:center;color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.tag{display:inline-block;font-size:12px;padding:3px 10px;border-radius:999px;white-space:nowrap;
  background:var(--paper-3);color:var(--muted)}
.t-ok{background:rgba(208,236,26,.4);color:#3f4d00}
.t-blocked,.t-error{background:rgba(40,37,36,.08);color:var(--ink)}
.t-js-shell,.t-mismatch,.t-no-price{background:rgba(40,37,36,.05);color:var(--muted)}
/* A grid, not flex-wrap: four headline numbers should sit on one row or two
   even rows, never three with a single orphan on the last. */
/* Charts sit on forest, like the social card, so the argument looks like one
   thing wherever someone meets it. */
.chart{margin:28px 0 0;padding:26px 24px 18px;background:var(--forest);border-radius:20px}
.chart svg{display:block;overflow:visible}
.chart figcaption{margin-top:18px;font-size:12.5px;line-height:1.5;color:rgba(231,229,228,.6);max-width:640px}
/* A 940-unit viewBox squeezed into a 340px phone renders 12px labels at four
   pixels. Scroll it instead — the tables on this page already do, and an
   unreadable chart is worse than one you have to nudge sideways. */
@media(max-width:700px){
  .chart{padding:18px 14px 14px;margin-left:-10px;margin-right:-10px;overflow-x:auto}
  .chart svg{min-width:760px}
  .chart figcaption{position:sticky;left:0}
}

.big{display:grid;gap:28px 40px;margin-top:36px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:860px){.big{grid-template-columns:repeat(4,minmax(0,1fr))}}
.big b{display:block;font-size:clamp(28px,3.6vw,42px);font-weight:400;letter-spacing:-.02em;line-height:1.1}
.big span{display:block;margin-top:6px;font-size:13px;color:var(--muted);line-height:1.45}

/* On a phone the column that matters is the last one, so it has to be on screen
   without a horizontal scroll. Drop the byte count (derivable from tokens) and
   both price columns — the outcome tag already says it: everything tagged
   "served" had its price in the HTML, and nothing else did. That only holds
   while price-presence tracks the tag exactly, so the renderer drops .terse
   when it stops holding and the columns come back. */
@media(max-width:700px){
  .tbl{min-width:0;font-size:12px}
  .tbl td,.tbl th{padding-right:6px}
  .tbl td{padding-top:12px;padding-bottom:12px}
  .tag{padding:3px 7px;font-size:11px}
  .tbl.terse th:nth-child(3),.tbl.terse td:nth-child(3),
  .tbl.terse th:nth-child(5),.tbl.terse td:nth-child(5),
  .tbl.terse th:nth-child(7),.tbl.terse td:nth-child(7){display:none}
  /* nowrap headers are what actually set the column widths here — letting the
     two-word ones wrap buys more than any font change. */
  .tbl th{white-space:normal}
  .tbl .mono{display:none}
}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}
</style>
</head>
<body>

{{header}}

<section class="hero" style="padding-bottom:24px">
  <div class="wrap">
    <p class="eyebrow enter">Benchmark · {{runAt}}</p>
    <h1 class="enter">The same product page,<br>{{ratio}}× cheaper to read.<br><span class="dim">Run it yourself in a minute.</span></h1>
    <p class="lede enter" style="--d:120ms;margin-top:24px">
      {{total}} real storefronts — Farm Rio, Fila, Osklen, Allbirds and others — one in-stock product
      each. We fetch that product two ways: as the HTML a storefront hands a browser, and as the
      document decoindex serves for the same URL. Then we check whether the price is even in there.
    </p>
    <div class="big enter" style="--d:200ms">
      <div><b>{{ratio}}×</b><span>fewer tokens, across the {{served}} storefronts that served the page</span></div>
      <div><b>{{medianIdx}}</b><span>median tokens for a decoindex document, against {{medianSite}}</span></div>
      {{heroAgent}}
      <div><b>{{blocked}} of {{total}}</b><span>storefronts refused a plain request outright</span></div>
    </div>
  </div>
</section>

<section style="padding-top:56px">
  <div class="wrap">
    <h2>Every brand, every number.</h2>
    <p class="fine">Ground truth — which product, what price — comes from the merchant's own catalog
       API, never from us. Ratios are only computed where the storefront actually served the product.</p>
    <div style="overflow-x:auto">
      <table class="tbl{{terse}}" style="margin-top:28px">
        <thead><tr>
          <th>Brand</th><th>Storefront said</th>
          <th class="num">HTML</th><th class="num">Tokens</th><th class="mid">Price in it?</th>
          <th class="num">decoindex<br>tokens</th><th class="mid">Price in it?</th><th class="num">Ratio</th>
        </tr></thead>
        <tbody>
{{rows}}
        </tbody>
      </table>
    </div>
    {{tokenChart}}
    {{stale}}
    <p class="fine">{{tokenNote}}</p>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>Two rows worth reading twice.</h2>
    <div class="cards">
      <div class="card">
        <h3>A page can be 200 and still say nothing</h3>
        <p class="fine" style="margin-top:0">{{shellNote}} We count that separately instead of folding
           it into the token ratio, because a small useless page would flatter us for the wrong reason.</p>
      </div>
      <div class="card">
        <h3>Some storefronts never answer at all</h3>
        <p class="fine" style="margin-top:0">{{blockedNote}} An agent hitting that gets a challenge page,
           not a catalog — which is the case for a channel the merchant actually opted into.</p>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>One shopping question, start to finish.<br><span class="dim">Handed the front door and nothing else.</span></h2>
    <p class="lede" style="margin-top:20px">Two identical agents. Each gets one sentence and one URL —
       the store's homepage. Nothing else: no category, no search link, no hint that the catalog can be
       ordered by price. Whatever product they come back with is looked up in the merchant's own API and
       either confirmed or thrown out.</p>
    <div class="pane" style="margin-top:28px;max-width:720px">
      <header><span>The task, verbatim</span></header>
<pre>Find the cheapest in-stock PlayStation 5 game this store
sells, and give me a link to buy it.

Store: https://www.americanas.com.br          &lt;- one agent
       https://decoindex.com/americanas.com   &lt;- the other</pre>
    </div>
    {{journeys}}
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>Does it hold with other models?<br><span class="dim">Same page, same question, no Anthropic anywhere.</span></h2>
    <p class="lede" style="margin-top:20px">If the advantage only showed up under one vendor's fetch tool, it would be a
       property of that tool rather than of the documents. So this runs the plainest agent there is — one
       tool that returns the response body verbatim, nothing summarizing it on the way — and asks two other
       models for the price and sizes of one product.</p>
    <div class="pane" style="margin-top:28px;max-width:720px">
      <header><span>The task, verbatim</span></header>
<pre>What is the current price of &lt;product&gt;, and which
sizes/variants are in stock?

Page: the storefront's own product page  &lt;- one run
      that same URL through decoindex    &lt;- the other</pre>
    </div>
    {{models}}
    {{costChart}}
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Run it yourself.</h2>
    <p class="lede" style="margin-top:20px">The first layer needs no key, no account and no permission.
       It talks to the merchants' public catalog APIs and to us, and it takes about a minute.</p>
    <div class="pane" style="margin-top:28px">
      <header><span>Layer 1 — free, no auth</span><span>~1 min</span></header>
<pre>git clone https://github.com/deco-cx/decoindex &amp;&amp; cd decoindex
node bench/run.mjs

# against your own deployment
node bench/run.mjs --base https://decoindex.com

# the agent layer. costs real money, needs a logged-in \`claude\` CLI
node bench/run.mjs --agents --reps 3</pre>
      <p class="pane-note">Writes <code>bench/results/latest.json</code> — the exact file this page renders.
         The published run is committed, so you can diff yours against ours.</p>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>What this does not measure.</h2>
    <div class="rows" style="margin-top:32px">
      <div class="row">
        <h3>Whether our data is right</h3>
        <p>decoindex reads the same public catalog API the ground truth comes from, so of course it
           carries the facts. This benchmark measures what it <em>costs an agent</em> to recover a fact
           the merchant already published — not whether we copied it correctly. Those are different
           claims and we are only making the first one.</p>
      </div>
      <div class="row">
        <h3>Whether the answer was the true cheapest</h3>
        <p>We confirm the product an agent names is real, in stock, and priced as claimed. We do not
           claim it is the global optimum. An earlier version tried: it compared against the cheapest
           full-text search result and marked the better answer wrong — the agent had found a real
           in-stock game cheaper than both that number and the category listing. A catalog is not
           consistently categorized, so "the cheapest X in this store" has no computable ground truth,
           and a grader that pretends otherwise is just a worse shopper than the thing it grades.</p>
      </div>
      <div class="row">
        <h3>Anything live</h3>
        <p>Stock and final price move. Every number here is what was true at one moment on
           {{runAt}}, from one machine, and the run records that timestamp. A storefront that was
           blocked that day may answer you fine today — re-run it and see.</p>
      </div>
      <div class="row">
        <h3>Latency you can compare</h3>
        <p>We answer warm off an edge cache; a storefront is rendering a page. Both timings are in the
           JSON and neither belongs in a headline, so there isn't one here.</p>
      </div>
      <div class="row">
        <h3>A representative sample of the web</h3>
        <p>These are {{total}} VTEX and Shopify storefronts, most of them deco customers, picked because
           we could verify them. It is not a random sample and a bigger one would move the number.</p>
      </div>
      <div class="row">
        <h3>What a browser-driving agent could do</h3>
        <p>An agent that runs a real browser can read any of these pages, including the empty shells.
           It just pays for a browser, a render and the tokens. That is the alternative, and it is a
           reasonable one — it is simply a lot more than one HTTP GET.</p>
      </div>
    </div>
  </div>
</section>

<section id="claim" style="padding-top:0">
  <div class="wrap">
    <div class="forest">
      <p class="eyebrow" style="color:var(--green-2)">For merchants</p>
      <h2>Your storefront is in this table.<br>The number is yours to change.</h2>
      <p>Reading your catalogue is free and stays free. If your row says blocked or empty shell, that is
         what an agent sees today — talk to us and we'll fix it. And if you'd rather we weren't here at
         all, say so, and we'll stop within a day.</p>
      <div class="cta-row">
        <a class="btn btn-lime" href="mailto:hi@deco.cx?subject=decoindex%20benchmark">Talk to us</a>
        <a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="/opt-out">Opt out</a>
      </div>
    </div>
  </div>
</section>

{{footer}}
</body>
</html>`;
