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
/** Category lines on an overview. Roots are never counted against it. */
const CHILD_BUDGET = 90;
/** Most children shown under any one root, so no single branch eats the budget. */
const MAX_CHILDREN_PER_ROOT = 8;

/**
 * A category list has to stay useful for a 5-category boutique and a 46-root
 * general retailer, and the naive answer fails the second badly: emitting the
 * tree depth-first and truncating meant americanas.com — which sells phones and
 * chocolate — advertised itself as two roots deep in farm equipment and crafts,
 * because "Agro" and "Artes" come first alphabetically and their subcategories
 * consumed the entire list.
 *
 * So: every root, always. Children then fill what's left, spread round-robin
 * across roots rather than draining the first one. And whatever is cut is
 * declared, because an agent that thinks it has seen the whole catalogue when it
 * has seen 3% will confidently tell a shopper the store does not stock something.
 */
function renderCategories(all: CategoryRef[], total: number | undefined, base: string): string[] {
  const roots = all.filter((c) => c.depth === 0);
  const childrenOf = new Map<string, CategoryRef[]>();
  for (const c of all) {
    if (c.depth === 0 || !c.parent) continue;
    const bucket = childrenOf.get(c.parent) ?? [];
    bucket.push(c);
    childrenOf.set(c.parent, bucket);
  }

  // Round-robin: one child from each root per pass, until the budget runs out.
  const shown = new Map<string, CategoryRef[]>();
  let spent = 0;
  for (let round = 0; round < MAX_CHILDREN_PER_ROOT && spent < CHILD_BUDGET; round++) {
    for (const root of roots) {
      if (spent >= CHILD_BUDGET) break;
      const child = childrenOf.get(root.name)?.[round];
      if (!child) continue;
      const picked = shown.get(root.name) ?? [];
      picked.push(child);
      shown.set(root.name, picked);
      spent++;
    }
  }

  const out = [`## Categories\n`];
  const totalKnown = total ?? all.length;
  out.push(
    `${roots.length} top-level ${roots.length === 1 ? "category" : "categories"}` +
      (totalKnown > roots.length ? `, ${totalKnown} including subcategories.` : ".") +
      ` Every category page lists its products; append \`?page=N\` to paginate.\n`,
  );

  for (const root of roots) {
    const kids = shown.get(root.name) ?? [];
    const totalKids = childrenOf.get(root.name)?.length ?? 0;
    out.push(`- [${root.name}](${base}${root.path})${root.count ? ` (${root.count})` : ""}`);
    for (const kid of kids) {
      out.push(`  - [${kid.name}](${base}${kid.path})${kid.count ? ` (${kid.count})` : ""}`);
    }
    if (totalKids > kids.length) {
      out.push(`  - _${totalKids - kids.length} more under ${root.name}, not listed here._`);
    }
  }
  out.push("");
  return out;
}

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

/**
 * Two things every public document owes the reader: a way to tell us the page is
 * wrong, and who is publishing it.
 *
 * The report line is not decoration. Nothing on the read path can tell the
 * difference between a genuinely empty category and one we parsed wrong — only
 * the caller can, at the moment it happens, and only if we asked.
 *
 * The footer drops away entirely once a merchant claims the domain: at that
 * point it is their page and we are not going to advertise on it.
 */
function footer(shop: Storefront, path: string, ctx: RenderCtx): string[] {
  const out: string[] = [
    `---\n`,
    `**Something wrong on this page?** Tell us and a human reads it:`,
    "```",
    `curl -X POST ${ctx.publicOrigin}/feedback \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '{"url":"${ctx.publicOrigin}/${shop.domain}${path}","kind":"wrong_data","message":"what you expected vs what you got"}'`,
    "```",
    `No key needed. \`kind\`: wrong_data · missing · broken · unsupported · other.\n`,
  ];

  if (shop.claimed) return out;

  out.push(
    `**About this page.** decoindex is run by [deco](https://decocms.com). deco operates`,
    `sites and apps for brands that take digital seriously — senior engineers, AI agents`,
    `and our own software, paid only on the results we generate. Over US$2bn of GMV a`,
    `year runs through it, across 150+ storefronts in production.`,
    ``,
    `${shop.name ?? shop.domain} has not claimed this page. Claiming it means the merchant`,
    `controls what is published here. Free storefront diagnostic at https://decocms.com/diagnostic`,
    `· remove this domain at ${ctx.publicOrigin}/opt-out\n`,
  );
  return out;
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
  out.push(...footer(shop, p.slug, ctx));

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
  out.push(...footer(shop, path, ctx));
  return out.join("\n");
}

export function renderHome(
  shop: Storefront,
  categories: CategoryRef[],
  ctx: RenderCtx,
  total?: number,
): string {
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
    out.push(...renderCategories(categories, total, base));
  }

  out.push(`## How to transact\n`);
  out.push(`1. Open a product page here and read the \`Add to cart\` column for the chosen variant.`);
  out.push(`2. That URL creates a cart on ${shop.domain}'s own checkout, with \`ref=decoindex\`.`);
  out.push(`3. It does **not** complete the purchase. Hand it to a person to review price,`);
  out.push(`   shipping and payment.\n`);
  out.push(...boundaries());
  out.push(...footer(shop, "/", ctx));
  return out.join("\n");
}

export function renderLlmsTxt(
  shop: Storefront,
  categories: CategoryRef[],
  ctx: RenderCtx,
  total?: number,
): string {
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
  out.push("");
  out.push(...renderCategories(categories, total, base));
  out.push("", `## Notes`, "");
  out.push(`- Prices and availability are observed, not guaranteed. Verify before promising.`);
  out.push(`- The merchant's own site is canonical: https://${shop.domain}`);
  return out.join("\n");
}

/** An honest failure beats a plausible one. Every non-200 says why, and what to do. */
export function renderProblem(
  domain: string,
  path: string,
  kind: "notfound" | "unsupported" | "blocked" | "opted-out" | "rate-limited" | "upstream",
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
    upstream: [
      "The storefront did not answer",
      [
        `${domain} is reachable, but its catalog API did not return an answer for this`,
        `request — a timeout, a throttle, or a server error on their side.`,
        ``,
        `**This does not mean the product is gone.** We will not tell you a page is missing`,
        `when what actually happened is that we could not look. Retry in a moment; this`,
        `result is cached for one minute only.`,
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
