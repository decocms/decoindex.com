# decoindex — operating manual

You are working on a public read service. Read this before changing anything.

## What this is

`decoindex.com/{domain}/{path}` returns an agent-readable representation of a
merchant storefront. An agent that already has a product URL swaps the origin
and gets normalized Markdown instead of client-rendered HTML.

The audience is **developers building agents**, not merchants and not shoppers.
Every decision gets judged against: does this make an agent more likely to
reach for us instead of scraping?

## The three invariants

Break these and the service stops being viable. They are not preferences.

**1. Reads are bounded, and never crawl.** A request is served from the edge
cache, from KV, or by resolving *that one URL* against the merchant's public
platform API — at most two upstream calls, a 5s timeout each, rate-limited per
domain, and negative-cached. A read never enumerates a catalog and never renders
HTML. A cold domain additionally pays one detection handshake, once, ever.

This is what makes "swap the origin and it just works" true, and the bound is
what stops anyone using us as an amplifier against a storefront. Bulk indexing
and search are the paid tier and run off the request path. If you find yourself
adding a third upstream call to a read, you are building the wrong thing.

**2. Catalog facts and commercial facts are never mixed.** Title, attributes,
variants, categories, observed base price: indexable, cacheable, ours to
publish. Live stock, final price after promotions, delivery dates,
personalized offers: not ours, not indexed, and every response says so
explicitly. An agent that promises what a merchant cannot honour costs the
merchant a return, a support ticket and a customer — that is how this service
dies, not through traffic cost.

**3. We are a channel, not a competitor.** `x-robots-tag: noindex` and
`rel=canonical` to the merchant on every response. Never rehost images. Every
outbound product link carries the attribution param. The day a decoindex page
outranks a merchant's own PDP is the day the commercial conversation ends.

## Architecture in one screen

```
Worker (Hono)  src/server/main.ts
  GET /{domain}/{...path}
    1. Cache API          hit -> return
    2. KV  md:{domain}{path}   hit -> return (+ refresh in waitUntil if stale)
    3. miss:
         D1 registry -> platform, or detectPlatform() once
         platform/resolve() -> Doc      <= 2 upstream calls, 5s each
         render/markdown.ts -> Markdown or JSON
         waitUntil: KV put (no TTL), D1 event

src/server/platform/   detect.ts + vtex.ts + shopify.ts, one resolve() each
src/server/render/     markdown.ts (documents) + landing.ts (the / page)

D1   registry: which domains exist, platform, origin, account, currency
     + the append-only events table
KV   rendered documents. Written WITHOUT a TTL — this is the index, not a cache
```

Platform detection decides everything: VTEX and Shopify address their catalog
JSON with the same paths their storefront uses, which is the entire reason a URL
swap can work without a crawl. That is why `src/server/platform/detect.ts`
matters more than it looks.

Supported: VTEX, Shopify. Wake needs a per-merchant `TCS-Access-Token`, so it
cannot be zero-config — it belongs to the paid tier, not here.

## Conventions

- `src/server/env.ts` mirrors `wrangler.jsonc` by hand. Secrets are optional so
  unconfigured features degrade instead of crashing.
- `npm run check` (`tsc --noEmit`) stays green. Always.
- Business logic is plain functions taking `env`. Nothing is coupled to a transport.
- A resolver returns a `Doc` (`lib/types.ts`); only `render/` knows about Markdown.
  Adding a platform means one file and one `case` in `platform/index.ts`.
- Prices are integers in minor units. No floats anywhere near money.
- `npm run smoke` runs the real end-to-end journey against live storefronts. It
  discovers an in-stock product rather than hardcoding one, because a hardcoded
  SKU passes until it sells out and then reports a bug that isn't there.

## Gotchas already paid for

1. **A miss is `200 []`, not 404.** VTEX and Shopify both answer a bad slug with
   an empty body and a success status. Empty *is* the not-found signal; check the
   payload, never the status.
2. **Detection must check `content-type`.** A VTEX store answers `/products.json`
   with `200 text/html` (its own 404 page). Status alone classifies half of
   Brazilian ecommerce as Shopify.
3. **VTEX `items[].variations` is an array of property *names*,** not a map. The
   values live as top-level keys on the item: `variations: ["Tamanho"]` and
   `item["Tamanho"]: ["U"]`. Reading it as a map silently yields an empty
   variants table on every product — which shipped once already.
4. **Shopify's two product endpoints disagree about stock.**
   `/collections/{h}/products.json` returns `available` and no inventory numbers;
   `/products/{handle}.json` returns inventory numbers and no `available`.
   Reading only `available` marks every product fetched by handle as sold out.
   See `availability()` in `platform/shopify.ts`.
5. **`workerd`'s fetch is not your laptop's fetch.** A WAF that returns 403 to
   curl can return 404 or 500 to the Worker. Treat 5xx on a public catalog
   endpoint as a block, not as "unsupported platform".
6. **Only `active` domains get a registry row.** A failed detection is remembered
   by the expiring negative KV entry instead, so a merchant who lifts a block or
   migrates platforms starts working on its own rather than being wrong forever.

## The improvement loop

Tables in `migrations/0002_loop.sql`: `goals`, `memories`, `hypotheses`,
plus the append-only `events` table from 0001. Read them with:

```
wrangler d1 execute decoindex --remote --command "SELECT ua_class, surface, COUNT(*) FROM events WHERE ts > date('now','-7 days') GROUP BY 1,2 ORDER BY 3 DESC"
```

Each session: brief yourself on the last 7 days of events → conclude any
`testing` hypothesis against real numbers → pick ONE `proposed` bet →
implement → deploy → record a `memory`. One hypothesis per change. Never
confirm your own bet: `reviewed_by` must differ from `author`.

**The metric that matters is `ua_class`.** Pageviews from browsers are vanity.
Reads from `openai`, `anthropic`, `perplexity` and `script` are the business.
If that number is flat after a change, the change did nothing.

## Autonomy ends at consequence

You own: code, schema, cache policy, ranking, deploys, analysis.
Ask a human first for: emailing merchants, changing what we publish about a
domain that asked to be removed, anything that spends money, deleting event
history, and any change that weakens the three invariants above.
