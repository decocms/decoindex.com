import type { CategoryRef, Product, Storefront } from "../lib/types";
import { canonicalUrl } from "../lib/url";

/**
 * Every response states its evidence boundary. The single most damaging thing
 * this service could do is let an agent promise something the merchant cannot
 * honour, so durable catalog facts and volatile commercial facts are labelled
 * differently, always, in every surface.
 *
 * Size is a feature: an agent that has to fetch twice has been failed once. The
 * caps below hold a product page to a couple of KB against ~1MB of HTML.
 */

const MAX_VARIANTS = 40;
const MAX_CLAIMS = 30;
const MAX_CATEGORIES = 60;

export interface RenderCtx {
  publicOrigin: string;
  attribution: { param: string; value: string };
}

const money = (minor: number | undefined, currency: string, locale = "pt-BR") =>
  minor === undefined
    ? "—"
    : new Intl.NumberFormat(currency === "BRL" ? locale : "en-US", {
        style: "currency",
        currency,
      }).format(minor / 100);

function frontmatter(fields: Record<string, string | number | boolean | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" && /[:#]/.test(v) ? JSON.stringify(v) : v}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

/** The paragraph an agent needs before it says anything to a shopper. */
function boundaries(): string[] {
  return [
    `## Before recommending or transacting\n`,
    "Catalog facts above are observed and timestamped. These are **not** verified here",
    "and must be confirmed with the merchant before any promise to a shopper:",
    "live stock for the chosen variant, final price after cart-level promotions and",
    "coupons, delivery date for the buyer's address, and return conditions.\n",
  ];
}

function nextSteps(shop: Storefront, ctx: RenderCtx, extra: string[] = []): string[] {
  const base = `${ctx.publicOrigin}/${shop.domain}`;
  return [
    `## Next steps\n`,
    ...extra,
    `- Any page of this storefront in Markdown: take its URL and swap the origin for \`${base}\``,
    `- Storefront overview: ${base}/`,
    `- Machine index: ${base}/llms.txt`,
    `- Same document as JSON: append \`.json\` to this URL\n`,
  ];
}

export function renderProduct(shop: Storefront, p: Product, ctx: RenderCtx): string {
  const canonical = canonicalUrl(shop.domain, p.slug, ctx.attribution);
  const prices = p.variants.map((v) => v.priceMinor).filter((n): n is number => n !== undefined);
  const min = prices.length ? Math.min(...prices) : undefined;
  const max = prices.length ? Math.max(...prices) : undefined;
  const priceLine =
    min === undefined
      ? "not published"
      : min === max
        ? money(min, shop.currency)
        : `${money(min, shop.currency)}–${money(max, shop.currency)}`;
  const inStock = p.variants.filter((v) => v.available);

  const out: string[] = [];
  out.push(
    frontmatter({
      decoindex: "1.0",
      type: "product",
      canonical_url: canonical,
      merchant: shop.name ?? shop.domain,
      domain: shop.domain,
      platform: shop.platform,
      currency: shop.currency,
      price: min,
      availability: inStock.length ? "InStock" : "OutOfStock",
      observed_at: p.observedAt,
      live_commercial_data: false,
    }),
  );

  out.push(`# ${p.title}\n`);
  if (p.brand) out.push(`**Brand:** ${p.brand}  `);
  if (p.categories.length) out.push(`**Category:** ${p.categories.join(" > ")}  `);
  out.push(`**Price observed:** ${priceLine} · ${inStock.length ? "in stock" : "sold out"}\n`);
  if (p.description) out.push(`${p.description}\n`);

  if (p.variants.length) {
    const attrKeys = [...new Set(p.variants.flatMap((v) => Object.keys(v.attributes)))].slice(0, 3);
    out.push(`## Variants\n`);
    out.push(`| SKU | ${attrKeys.join(" | ")}${attrKeys.length ? " | " : ""}Price | Stock | Add to cart |`);
    out.push(`|---|${attrKeys.map(() => "---|").join("")}---:|---|---|`);
    for (const v of p.variants.slice(0, MAX_VARIANTS)) {
      const cells = attrKeys.map((k) => v.attributes[k] ?? "—");
      const avail =
        v.available === undefined ? "verify live" : v.available ? "in stock" : "sold out";
      out.push(
        `| ${v.skuId} | ${cells.length ? cells.join(" | ") + " | " : ""}${money(v.priceMinor, v.currency)} | ${avail} | ${v.cartUrl ?? "—"} |`,
      );
    }
    if (p.variants.length > MAX_VARIANTS) {
      out.push(`\n_${p.variants.length - MAX_VARIANTS} more variants not shown._`);
    }
    out.push("");
    if (inStock.length) {
      out.push(
        `The cart link builds a cart on the merchant's own checkout and does **not** complete a purchase.`,
        `Hand it to a person to review price, shipping and payment.\n`,
      );
    }
  }

  if (p.claims.length) {
    out.push(`## Product facts\n`);
    for (const c of p.claims.slice(0, MAX_CLAIMS)) {
      out.push(`- **${c.predicate.replace(/_/g, " ")}:** ${c.value}`);
    }
    out.push("");
  }

  if (p.images.length) {
    out.push(`## Images\n`);
    for (const src of p.images) out.push(`- ${src}`);
    out.push("");
  }

  out.push(...boundaries());
  out.push(
    ...nextSteps(shop, ctx, [
      `- This product on the merchant's site: ${canonical}`,
      ...(p.categories.length
        ? [`- Browse the category: ${ctx.publicOrigin}/${shop.domain}/ (see the category list)`]
        : []),
    ]),
  );
  out.push(`## Evidence\n`);
  out.push(`- Source: \`${shop.platform}\` public catalog API on ${shop.domain}, read ${p.observedAt}`);
  out.push(`- Not verified here: live stock, final price, delivery promise, personalized offers`);
  out.push(`- Canonical source: ${canonical}\n`);

  return out.join("\n");
}

export function renderListing(
  shop: Storefront,
  doc: { title: string; description?: string; total?: number; page: number; products: Product[] },
  path: string,
  ctx: RenderCtx,
): string {
  const base = `${ctx.publicOrigin}/${shop.domain}`;
  const canonical = canonicalUrl(shop.domain, path, ctx.attribution);
  const out: string[] = [];
  out.push(
    frontmatter({
      decoindex: "1.0",
      type: "product_list",
      canonical_url: canonical,
      merchant: shop.name ?? shop.domain,
      domain: shop.domain,
      platform: shop.platform,
      title: doc.title,
      total_results: doc.total,
      page: doc.page,
      shown: doc.products.length,
      currency: shop.currency,
      observed_at: new Date().toISOString(),
      live_commercial_data: false,
    }),
  );
  out.push(`# ${doc.title}\n`);
  if (doc.description) out.push(`${doc.description}\n`);
  out.push(
    doc.total
      ? `${doc.total} products. Showing ${doc.products.length} (page ${doc.page}).\n`
      : `Showing ${doc.products.length} products (page ${doc.page}).\n`,
  );

  out.push(`| Product | Price | Was | Stock | Details |`);
  out.push(`|---|---:|---:|---|---|`);
  for (const p of doc.products) {
    const prices = p.variants.map((v) => v.priceMinor).filter((n): n is number => n !== undefined);
    const list = p.variants
      .map((v) => v.listPriceMinor)
      .filter((n): n is number => n !== undefined);
    const price = prices.length ? Math.min(...prices) : undefined;
    const was = list.length ? Math.max(...list) : undefined;
    out.push(
      `| ${p.title.replace(/\|/g, "/")} | ${money(price, shop.currency)} | ${
        was && price && was > price ? money(was, shop.currency) : "—"
      } | ${p.variants.some((v) => v.available) ? "yes" : "no"} | ${base}${p.slug} |`,
    );
  }
  out.push("");

  const nextPage = `${base}${path}?page=${doc.page + 1}`;
  const hasMore = doc.total ? doc.page * doc.products.length < doc.total : doc.products.length >= 24;
  out.push(...boundaries());
  out.push(...nextSteps(shop, ctx, hasMore ? [`- Next page: ${nextPage}`] : []));
  return out.join("\n");
}

export function renderHome(shop: Storefront, categories: CategoryRef[], ctx: RenderCtx): string {
  const base = `${ctx.publicOrigin}/${shop.domain}`;
  const out: string[] = [];
  out.push(
    frontmatter({
      decoindex: "1.0",
      type: "storefront",
      canonical_url: `https://${shop.origin.replace(/^https?:\/\//, "")}/`,
      merchant: shop.name ?? shop.domain,
      domain: shop.domain,
      platform: shop.platform,
      account: shop.account,
      currency: shop.currency,
      country: shop.country,
      locale: shop.locale,
      theme_color: shop.themeColor,
      live_commercial_data: false,
    }),
  );
  out.push(`# ${shop.name ?? shop.domain}\n`);

  // The merchant's own words first. An agent choosing between four storefronts
  // needs to know which one this is before it needs to know how to query it.
  if (shop.description) {
    out.push(`> ${shop.description}\n`);
    out.push(`_Above: how ${shop.domain} describes itself, from its own site metadata._\n`);
  }

  const facts: string[] = [];
  if (shop.name && shop.name !== shop.domain) facts.push(`**Merchant:** ${shop.name}`);
  facts.push(`**Site:** https://${shop.domain}`);
  facts.push(`**Platform:** ${shop.platform}${shop.account ? ` (account \`${shop.account}\`)` : ""}`);
  facts.push(`**Currency:** ${shop.currency}`);
  if (shop.country) facts.push(`**Country:** ${shop.country}`);
  if (shop.locale) facts.push(`**Locale:** ${shop.locale}`);
  if (shop.themeColor) facts.push(`**Brand colour:** \`${shop.themeColor}\``);
  if (shop.logoUrl) facts.push(`**Brand image:** ${shop.logoUrl}`);
  for (const f of facts) out.push(`- ${f}`);
  out.push("");

  out.push(`## How to address any page\n`);
  out.push(`Take a URL on \`${shop.domain}\` and swap the origin for \`${ctx.publicOrigin}/${shop.domain}\`:\n`);
  out.push("```");
  out.push(`https://${shop.domain}/some/product/path`);
  out.push(`${base}/some/product/path`);
  out.push("```\n");
  out.push(`- Append \`.json\` for the same document as structured JSON.`);
  out.push(`- Listings paginate with \`?page=N\`.\n`);

  if (categories.length) {
    out.push(`## Categories\n`);
    for (const c of categories.slice(0, MAX_CATEGORIES)) {
      out.push(`- [${c.name}](${base}${c.path})${c.count ? ` (${c.count})` : ""}`);
    }
    out.push("");
  }

  out.push(`## How to transact\n`);
  out.push(`1. Open a product page here and read the \`Add to cart\` column for the chosen variant.`);
  out.push(`2. That URL creates a cart on ${shop.domain}'s own checkout, with \`ref=decoindex\`.`);
  out.push(`3. It does **not** complete the purchase. Hand it to a person to review price,`);
  out.push(`   shipping and payment.\n`);
  out.push(...boundaries());
  return out.join("\n");
}

export function renderLlmsTxt(shop: Storefront, categories: CategoryRef[], ctx: RenderCtx): string {
  const base = `${ctx.publicOrigin}/${shop.domain}`;
  const out = [`# ${shop.name ?? shop.domain}`, ""];
  out.push(
    shop.description
      ? `> ${shop.description}`
      : `> Agent-readable mirror of the ${shop.domain} storefront.`,
    "",
  );
  out.push(`## Facts`, "");
  if (shop.name && shop.name !== shop.domain) out.push(`- **Merchant:** ${shop.name}`);
  out.push(`- **Site:** https://${shop.domain}`);
  out.push(`- **Platform:** ${shop.platform}`);
  out.push(`- **Currency:** ${shop.currency}`);
  if (shop.country) out.push(`- **Country:** ${shop.country}`);
  if (shop.locale) out.push(`- **Locale:** ${shop.locale}`);
  if (shop.themeColor) out.push(`- **Brand colour:** ${shop.themeColor}`);
  out.push(
    `- **Published here:** catalog facts only — live stock, final price and delivery are not.`,
    "",
  );
  // Most actionable thing in the file, so it goes first: agents truncate.
  out.push(`## Format for agents`, "");
  out.push(`- [Storefront overview](${base}/): categories and URL conventions`);
  out.push(
    `- Any storefront URL works: replace \`https://${shop.domain}\` with \`${base}\``,
  );
  out.push(`- Append \`.json\` to any of these for structured JSON`);
  out.push("", `## Categories`, "");
  for (const c of categories.slice(0, MAX_CATEGORIES)) {
    out.push(`- [${c.name}](${base}${c.path})`);
  }
  out.push("", `## Notes`, "");
  out.push(`- Prices and availability are observed, not guaranteed. Verify before promising.`);
  out.push(`- The merchant's own site is canonical: https://${shop.domain}`);
  return out.join("\n");
}

/** An honest failure beats a plausible one. Every non-200 says why, and what to do. */
export function renderProblem(
  domain: string,
  path: string,
  kind: "notfound" | "unsupported" | "blocked" | "opted-out" | "rate-limited",
  ctx: RenderCtx,
): string {
  const body: Record<typeof kind, [string, string[]]> = {
    notfound: [
      "Not found",
      [
        `\`${path}\` did not resolve to a product or listing on ${domain}.`,
        ``,
        `The URL shape is fine — this path just has no catalog data behind it. Storefront`,
        `pages built from CMS collections rather than real categories resolve through ids`,
        `we cannot see, and we do not guess: for a commerce agent, wrong is worse than absent.`,
        ``,
        `Try the overview: ${ctx.publicOrigin}/${domain}/`,
      ],
    ],
    unsupported: [
      "Could not read this storefront",
      [
        `${domain} answered, but not with a catalog we can read.`,
        ``,
        `Either it is not running a platform we support — VTEX and Shopify, via their`,
        `public catalog APIs — or its edge is refusing us without saying so. We do not`,
        `scrape HTML, so the answer is nothing rather than a bad guess.`,
        ``,
        `This verdict is not permanent: we retry from scratch on a later request.`,
        `Merchant on another platform, or want to allow us? ${ctx.publicOrigin}/#claim`,
      ],
    ],
    blocked: [
      "Origin refused us",
      [
        `${domain} is reachable but its edge rejected our request (bot protection or WAF).`,
        ``,
        `We identify ourselves honestly as \`decoindex\` and do not work around blocks. If`,
        `you are the merchant and want this to work, allow that user-agent.`,
        ``,
        `This verdict is not permanent: we retry from scratch on a later request.`,
        `${ctx.publicOrigin}/about`,
      ],
    ],
    "opted-out": [
      "Removed at the merchant's request",
      [
        `${domain} asked not to be mirrored. Use the storefront directly: https://${domain}`,
      ],
    ],
    "rate-limited": [
      "Slow down",
      [
        `Too many first-time reads for ${domain} at once. Cached pages are always served`,
        `immediately; this limit only applies to URLs we have never seen. Retry shortly.`,
      ],
    ],
  };
  const [title, lines] = body[kind];
  return [
    frontmatter({
      decoindex: "1.0",
      type: "problem",
      problem: kind,
      domain,
      path,
    }),
    `# ${title}\n`,
    ...lines,
    "",
  ].join("\n");
}
