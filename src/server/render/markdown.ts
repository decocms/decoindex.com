import type { CategoryRef, Product, Sort, Storefront } from "../lib/types";
import { canonicalUrl } from "../lib/url";
import { fromPrice } from "../platform/order";

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
/**
 * Roots are shown ahead of any child, but they are not unlimited.
 *
 * "Every root, always" was written for americanas, which has 46 of them and was
 * being misrepresented by depth-first truncation. It assumed a tree. Drogaria
 * São Paulo's catalog is flat — 1,591 top-level categories and almost no
 * children — so the same rule produced a 143 KB overview, 36k tokens, on the
 * one page whose whole purpose is to be small enough to read. Cap them, and say
 * how many were left out, exactly as we already do for children.
 */
const ROOT_BUDGET = 80;
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
  const allRoots = all.filter((c) => c.depth === 0);
  // Biggest first where the platform tells us how big, so a cut list keeps the
  // categories a shopper is most likely to want.
  const ranked = allRoots.some((c) => c.count)
    ? [...allRoots].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    : allRoots;
  const roots = ranked.slice(0, ROOT_BUDGET);
  const droppedRoots = allRoots.length - roots.length;
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
    `${allRoots.length} top-level ${allRoots.length === 1 ? "category" : "categories"}` +
      (totalKnown > allRoots.length ? `, ${totalKnown} including subcategories.` : ".") +
      (droppedRoots ? ` Showing the ${roots.length} largest.` : "") +
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
      out.push(
        `  - _${totalKids - kids.length} more — open [${root.name}](${base}${root.path}) to see them all._`,
      );
    }
  }
  if (droppedRoots) {
    out.push(
      ``,
      `_${droppedRoots} more top-level categories are not listed. This catalog is flat — almost every_`,
      `_category is top-level — so search is the faster way in: \`${base}/search?q={words}\`._`,
    );
  }
  out.push("");
  return out;
}

/** No price and not purchasable: a marketplace listing with no live offer. */
function isDeadOffer(p: Product): boolean {
  const priced = p.variants.some((v) => (v.priceMinor ?? 0) > 0);
  const stocked = p.variants.some((v) => v.available);
  return !priced && !stocked;
}

/** One row per product: the least an agent needs to choose one and open it. */
function productTable(products: Product[], shop: Storefront, base: string): string[] {
  /**
   * Rows with no price and no stock are marketplace entries whose seller has no
   * live offer. They are not wrong, but they carry nothing a shopper can act on,
   * and on some categories they outnumber the real offers badly enough to bury
   * them — an agent reported 69 of 73 rows like this, drowning the four it
   * wanted. Stable partition, so real offers come first and nothing is dropped.
   */
  const live = products.filter((p) => !isDeadOffer(p));
  const dead = products.filter(isDeadOffer);
  const ordered = [...live, ...dead];

  const out = [
    `| Product | Price | Was | Stock | Details |`,
    `|---|---:|---:|---|---|`,
  ];
  for (const p of ordered) {
    const list = p.variants.map((v) => v.listPriceMinor).filter((n): n is number => n !== undefined);
    // Same definition the sorter uses, deliberately shared rather than repeated.
    // These drifted apart once: the column showed the cheapest of *all* variants
    // while price_asc ordered on the cheapest *buyable* one, so a sorted table
    // printed 199,99 above 199,98 and contradicted its own heading. It also meant
    // advertising a price whose only variant was sold out.
    const price = fromPrice(p);
    const was = list.length ? Math.max(...list) : undefined;
    out.push(
      `| ${p.title.replace(/\|/g, "/")} | ${money(price, shop.currency)} | ${
        was && price && was > price ? money(was, shop.currency) : "—"
      } | ${p.variants.some((v) => v.available) ? "yes" : "no"} | ${base}${p.slug} |`,
    );
  }
  out.push("");
  if (dead.length) {
    out.push(
      `_${dead.length} of these ${products.length} rows have no price and no stock — marketplace`,
      `listings with no live offer. They are listed last; the rest are real offers._\n`,
    );
  }
  return out;
}

/** Human names for the sort values, so the link text says what it does. */
const ORDER_LABELS: [Sort, string][] = [
  ["price_asc", "Cheapest first"],
  ["price_desc", "Most expensive first"],
  ["discount", "Biggest discount first"],
  ["new", "Newest first"],
  ["relevance", "Most relevant first"],
  ["name_asc", "A to Z"],
];

/** A neutral second example, so the pattern is obvious from two instances. */
const EXAMPLE_QUERY = "presente";

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

/**
 * True when every in-stock row precedes every out-of-stock row and there is at
 * least one of each — i.e. availability, not price, drove the top-level order.
 */
function availableFirst(products: Product[]): boolean {
  const stock = products.map((p) => p.variants.some((v) => v.available));
  const firstOut = stock.indexOf(false);
  if (firstOut === -1 || !stock[0]) return false;
  return !stock.slice(firstOut).includes(true);
}

export function renderListing(
  shop: Storefront,
  doc: {
    title: string;
    description?: string;
    total?: number;
    page: number;
    products: Product[];
    sort?: Sort;
    sortedWithinPage?: boolean;
    subcategories?: CategoryRef[];
    query?: string;
  },
  path: string,
  ctx: RenderCtx,
  query?: string,
): string {
  const base = `${ctx.publicOrigin}/${shop.domain}`;
  // The query is part of the address for a search. Dropping it points the
  // canonical at an empty search box on the merchant's site.
  const canonical = canonicalUrl(shop.domain, path + (query ? `?${query}` : ""), ctx.attribution);
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
      sort: doc.sort,
      // Says out loud when the order covers only this page, so an agent never
      // reports the cheapest of 24 as the cheapest of the catalog.
      sorted_within_page: doc.sortedWithinPage,
      currency: shop.currency,
      observed_at: new Date().toISOString(),
      live_commercial_data: false,
    }),
  );
  out.push(`# ${doc.title}\n`);
  if (doc.description) out.push(`${doc.description}\n`);
  if (doc.query) {
    out.push(
      doc.products.length
        ? `${doc.total ? `${doc.total} matches for ` : "Matches for "}**${doc.query}**` +
            `. Showing ${doc.products.length}.\n`
        : `No products matched **${doc.query}** on this storefront. Try a broader term, ` +
            `or browse the categories on ${base}/.\n`,
    );
  } else {
    out.push(
      doc.total
        ? `${doc.total} products. Showing ${doc.products.length} (page ${doc.page}).\n`
        : `Showing ${doc.products.length} products (page ${doc.page}).\n`,
    );
  }

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

  // Ordering has to be discoverable from the document itself: "which is cheapest"
  // is unanswerable from one arbitrary page of a large category, and an agent
  // cannot ask for something it was never told exists.
  const q = (extra: string) => `${base}${path}?${doc.sort ? `sort=${doc.sort}&` : ""}${extra}`;
  if (doc.sortedWithinPage) {
    out.push(
      `Ordered by \`${doc.sort}\` **within this page only** — this platform cannot order the`,
      `whole collection for us, so these are the ${doc.products.length} shown here in that order,`,
      `not the ${doc.total ?? "full"}-product collection. Do not report these as the extremes of the collection.\n`,
    );
  } else if (doc.sort) {
    out.push(`Ordered by \`${doc.sort}\` across the whole result set, ${doc.total ?? "all"} products.`);
    // VTEX returns available products first and unavailable ones after, each run
    // ordered independently — so the price column ascends, restarts, and ascends
    // again. Said only when the rows actually show it, rather than asserting a
    // platform rule we have not checked everywhere.
    if (availableFirst(doc.products)) {
      out.push(
        `In-stock products come first, then out-of-stock, each ordered separately — so the price`,
        `column restarts partway down. Compare within a stock group, not across the whole table.`,
      );
    }
    out.push("");
  } else {
    out.push(
      `Catalog default order. Add \`?sort=price_asc\` for the cheapest first`,
      `(also: price_desc, name_asc, name_desc, discount, new, relevance).\n`,
    );
  }

  const nextPage = q(`page=${doc.page + 1}`);
  const hasMore = doc.total ? doc.page * doc.products.length < doc.total : doc.products.length >= 24;
  /**
   * Sort options as links, not as documented syntax.
   *
   * An agent told us plainly why: "?sort=discount is documented in the footer,
   * but I could not exercise it, because I can only fetch URLs that appeared in
   * the navigation." It cannot build a URL — it can only follow one it was
   * handed. Documentation an agent cannot act on is decoration.
   */
  {
    const q = new URLSearchParams(query ?? "");
    const link = (value: Sort) => {
      const p = new URLSearchParams(q);
      p.set("sort", value);
      p.delete("page");
      return `${base}${path}?${p.toString()}`;
    };
    out.push(`## Other orders\n`);
    out.push(
      `Each of these re-orders the whole ${doc.query ? "result set" : "category"}, not just this page:\n`,
    );
    for (const [value, label] of ORDER_LABELS) {
      if (value === doc.sort) continue;
      out.push(`- [${label}](${link(value)})`);
    }
    out.push("");
  }

  if (doc.subcategories?.length) {
    out.push(`## Subcategories\n`);
    out.push(`${doc.subcategories.length} directly under ${doc.title}:\n`);
    for (const c of doc.subcategories) {
      out.push(`- [${c.name}](${base}${c.path})`);
    }
    out.push("");
  }

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
  popular?: Product[],
  popularBasis?: "best-selling" | "featured",
  topSearches?: { term: string; count?: number }[],
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
  out.push(`- Listings paginate with \`?page=N\` and order with \`?sort=price_asc\`.`);
  out.push("");

  const sample = topSearches?.[0]?.term;
  out.push(`## Search this storefront\n`);
  out.push(
    `One request, instead of walking the category tree. Replace the words at the end:\n`,
  );
  if (sample) {
    out.push(`- [${base}/search?q=${encodeURIComponent(sample)}](${base}/search?q=${encodeURIComponent(sample)})`);
  }
  out.push(`- [${base}/search?q=${encodeURIComponent(EXAMPLE_QUERY)}](${base}/search?q=${encodeURIComponent(EXAMPLE_QUERY)})`);
  out.push(`\n\`${base}/busca/{words}\` resolves the same way — it is this storefront's own`);
  out.push(`search path, so a URL copied from the store works unchanged.\n`);

  if (categories.length) {
    out.push(...renderCategories(categories, total, base));
  }

  /**
   * A category list tells an agent how the merchant files things. It does not
   * tell it what the merchant is actually known for, which is the question
   * being asked when something reads this page before deciding whether to go
   * deeper. Best sellers answer that in twenty lines.
   */
  if (popular?.length) {
    out.push(
      popularBasis === "featured"
        ? `## Featured by the merchant\n`
        : `## Best sellers\n`,
    );
    out.push(
      popularBasis === "featured"
        ? `The merchant's own homepage selection, in their order. Not a popularity ranking.\n`
        : `The storefront's own best-selling order, as its catalog API reports it today.\n`,
    );
    out.push(...productTable(popular, shop, base));
  }

  /**
   * And what shoppers type. VTEX publishes its own search terms with real
   * volumes — the merchant's demand data, in the merchant's own words, which is
   * a far better vocabulary for querying this catalog than anything we'd guess.
   */
  if (topSearches?.length) {
    out.push(`## What shoppers search for here\n`);
    out.push(
      `The storefront's own top search terms, with the number of searches it reports.`,
      `Useful as query vocabulary: these are the words this audience actually uses.\n`,
    );
    for (const t of topSearches) {
      const url = `${base}/busca/${encodeURIComponent(t.term).replace(/%20/g, "-")}`;
      out.push(
        `- [${t.term}](${url})${t.count ? ` — ${t.count.toLocaleString("en-US")} searches` : ""}`,
      );
    }
    out.push("");
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
