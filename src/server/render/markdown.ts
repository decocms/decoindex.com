import type { Product, SearchHit, StorefrontMeta } from "../lib/types";
import { canonicalUrl } from "../lib/url";

/**
 * Every response states its evidence boundary. The single most damaging thing
 * this service could do is let an agent promise something the merchant cannot
 * honour, so durable catalog facts and volatile commercial facts are labelled
 * differently, always, in every surface.
 */

export interface RenderCtx {
  publicOrigin: string;
  attribution: { param: string; value: string };
}

const money = (minor?: number, currency = "BRL") =>
  minor === undefined
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(minor / 100);

function frontmatter(fields: Record<string, string | number | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" && /[:#]/.test(v) ? JSON.stringify(v) : v}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export function renderProduct(meta: StorefrontMeta, p: Product, ctx: RenderCtx): string {
  const canonical = canonicalUrl(meta.domain, p.slug, ctx.attribution);
  const prices = p.variants.map((v) => v.priceMinor).filter((n): n is number => n !== undefined);
  const priceLine = prices.length
    ? prices.length > 1 && Math.min(...prices) !== Math.max(...prices)
      ? `${money(Math.min(...prices))}–${money(Math.max(...prices))}`
      : money(prices[0])
    : "not published";

  const out: string[] = [];
  out.push(
    frontmatter({
      decoindex: "1.0",
      type: "product",
      canonical_url: canonical,
      merchant: meta.name ?? meta.domain,
      domain: meta.domain,
      platform: meta.platform,
      index_status: meta.status,
      locale: meta.locale,
      currency: meta.currency,
      indexed_at: p.observedAt,
      live_commercial_data: "false",
    }),
  );

  out.push(`# ${p.title}\n`);
  if (p.brand) out.push(`**Brand:** ${p.brand}  `);
  if (p.categories.length) out.push(`**Category:** ${p.categories.join(" > ")}  `);
  out.push(`**Price observed:** ${priceLine}\n`);
  if (p.description) out.push(`${p.description}\n`);

  if (p.variants.length) {
    const attrKeys = [...new Set(p.variants.flatMap((v) => Object.keys(v.attributes)))].slice(0, 4);
    out.push(`## Variants\n`);
    out.push(`| SKU | ${attrKeys.join(" | ")}${attrKeys.length ? " | " : ""}Price | Availability |`);
    out.push(`|---|${attrKeys.map(() => "---|").join("")}---:|---|`);
    for (const v of p.variants.slice(0, 60)) {
      const cells = attrKeys.map((k) => v.attributes[k] ?? "—");
      const avail =
        v.available === undefined ? "verify live" : v.available ? "in stock (as indexed)" : "sold out (as indexed)";
      out.push(`| ${v.skuId} | ${cells.length ? cells.join(" | ") + " | " : ""}${money(v.priceMinor, v.currency)} | ${avail} |`);
    }
    out.push("");
  }

  if (p.claims.length) {
    out.push(`## Product facts\n`);
    for (const c of p.claims.slice(0, 40)) {
      out.push(`- **${c.predicate.replace(/_/g, " ")}:** ${c.value}`);
    }
    out.push("");
  }

  if (p.images.length) {
    out.push(`## Images\n`);
    for (const src of p.images) out.push(`- ${src}`);
    out.push("");
  }

  out.push(`## Before recommending or transacting\n`);
  out.push(
    [
      "Verify against the merchant before making any promise to a shopper:",
      "selected-size availability, final price after promotions, delivery date",
      "for the buyer's address, and return conditions for this specific item.",
    ].join(" ") + "\n",
  );

  out.push(`## Evidence\n`);
  out.push(`- Catalog facts: \`${sourceSummary(p)}\`, observed ${p.observedAt}`);
  out.push(`- Index status: \`${meta.status}\`${meta.status === "discovered" ? " (public sources only, not merchant-confirmed)" : ""}`);
  out.push(`- Not verified here: live stock, final price, delivery promise, personalized offers`);
  out.push(`- Canonical source: ${canonical}\n`);

  return out.join("\n");
}

function sourceSummary(p: Product): string {
  const sources = [...new Set(p.claims.map((c) => c.source))];
  return sources.length ? sources.join(", ") : p.id.split(":")[0]!;
}

export function renderBrand(
  meta: StorefrontMeta,
  categories: { path: string; count: number }[],
  sample: Product[],
  ctx: RenderCtx,
): string {
  const base = `${ctx.publicOrigin}/${meta.domain}`;
  const out: string[] = [];
  out.push(
    frontmatter({
      decoindex: "1.0",
      type: "storefront",
      domain: meta.domain,
      merchant: meta.name ?? meta.domain,
      platform: meta.platform,
      index_status: meta.status,
      products_indexed: meta.productCount,
      catalog_freshness: meta.catalogFreshness,
      locale: meta.locale,
      currency: meta.currency,
    }),
  );
  out.push(`# ${meta.name ?? meta.domain}\n`);
  out.push(
    meta.status === "queued"
      ? `This storefront is known but not yet indexed. A catalog ingest has been queued; retry shortly.\n`
      : `${meta.productCount} products indexed from \`${meta.platform}\`, last refreshed ${meta.catalogFreshness ?? "unknown"}.\n`,
  );

  out.push(`## How to query this storefront\n`);
  out.push(`- Search: \`${base}/search?q=<query>\` — hybrid lexical + semantic over the full catalog`);
  out.push(`- Category listing: \`${base}/c/<category>\``);
  out.push(`- Any product page: \`${base}<merchant path>.md\``);
  out.push(`- Full catalog: \`${base}/products.json\``);
  out.push(`- Index of everything: \`${base}/llms.txt\`\n`);

  if (categories.length) {
    out.push(`## Categories\n`);
    for (const c of categories.slice(0, 40)) {
      out.push(`- ${c.path} (${c.count})`);
    }
    out.push("");
  }

  if (sample.length) {
    out.push(`## Sample products\n`);
    for (const p of sample.slice(0, 10)) {
      out.push(`- [${p.title}](${base}${p.slug}.md)`);
    }
    out.push("");
  }

  out.push(`## Boundaries\n`);
  out.push(`- Catalog facts come from public merchant sources and are timestamped.`);
  out.push(`- Stock, final price, delivery and returns must be verified with the merchant.`);
  out.push(`- Merchants can claim this domain or opt out: ${ctx.publicOrigin}/opt-out\n`);
  return out.join("\n");
}

export function renderLlmsTxt(meta: StorefrontMeta, products: Product[], ctx: RenderCtx): string {
  const base = `${ctx.publicOrigin}/${meta.domain}`;
  const out = [`# ${meta.name ?? meta.domain}`, ""];
  out.push(
    `> Agent-readable index of ${meta.productCount} products. Catalog facts as of ${meta.catalogFreshness ?? "unknown"}. Live commercial data is not included.`,
    "",
  );
  out.push(`## Query interfaces`, "");
  out.push(`- [Search](${base}/search?q=): hybrid search over the catalog`);
  out.push(`- [Catalog JSON](${base}/products.json): full normalized catalog`);
  out.push("", `## Products`, "");
  for (const p of products) {
    out.push(`- [${p.title}](${base}${p.slug}.md)`);
  }
  return out.join("\n");
}

export function renderSearch(
  meta: StorefrontMeta,
  query: string,
  hits: SearchHit[],
  ctx: RenderCtx,
): string {
  const base = `${ctx.publicOrigin}/${meta.domain}`;
  const out: string[] = [];
  out.push(
    frontmatter({
      decoindex: "1.0",
      type: "search_results",
      domain: meta.domain,
      query,
      results: hits.length,
      catalog_freshness: meta.catalogFreshness,
      live_commercial_data: "false",
    }),
  );
  out.push(`# Search: ${query}\n`);
  if (!hits.length) {
    out.push(`No products matched in the indexed catalog of ${meta.domain}.\n`);
    out.push(`The catalog holds ${meta.productCount} products; try broader terms or browse \`${base}\`.\n`);
    return out.join("\n");
  }
  hits.forEach((hit, i) => {
    const p = hit.product;
    const prices = p.variants.map((v) => v.priceMinor).filter((n): n is number => n !== undefined);
    out.push(`## ${i + 1}. ${p.title}\n`);
    out.push(`- Price observed: ${prices.length ? money(Math.min(...prices)) : "not published"}`);
    if (p.categories.length) out.push(`- Category: ${p.categories.join(" > ")}`);
    const sizes = [...new Set(p.variants.map((v) => v.attributes.tamanho ?? v.attributes.size).filter(Boolean))];
    if (sizes.length) out.push(`- Variants indexed: ${sizes.join(", ")}`);
    out.push(`- Why this matched: ${hit.why.join("; ")}`);
    out.push(`- Details: ${base}${p.slug}.md`);
    out.push(`- Buy: ${canonicalUrl(meta.domain, p.slug, ctx.attribution)}\n`);
  });
  out.push(`---\nStock, final price and delivery are not verified here. Confirm on the merchant page before promising anything to a shopper.\n`);
  return out.join("\n");
}

export function renderPlp(
  meta: StorefrontMeta,
  category: string,
  products: Product[],
  ctx: RenderCtx,
): string {
  const base = `${ctx.publicOrigin}/${meta.domain}`;
  const out: string[] = [];
  out.push(
    frontmatter({
      decoindex: "1.0",
      type: "category",
      domain: meta.domain,
      category,
      products: products.length,
      catalog_freshness: meta.catalogFreshness,
    }),
  );
  out.push(`# ${category} — ${meta.name ?? meta.domain}\n`);
  out.push(`| Product | Price observed | Variants | Details |`);
  out.push(`|---|---:|---|---|`);
  for (const p of products) {
    const prices = p.variants.map((v) => v.priceMinor).filter((n): n is number => n !== undefined);
    out.push(
      `| ${p.title} | ${prices.length ? money(Math.min(...prices)) : "—"} | ${p.variants.length} | ${base}${p.slug}.md |`,
    );
  }
  out.push("");
  return out.join("\n");
}
