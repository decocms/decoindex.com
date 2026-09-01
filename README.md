# decoindex

Agent-readable mirrors of ecommerce storefronts.

Put `decoindex.com/` in front of any VTEX or Shopify storefront URL and get
normalized Markdown instead of a megabyte of client-rendered HTML:

```
https://www.farmrio.com.br/moda-feminina/acessorios
https://decoindex.com/farmrio.com.br/moda-feminina/acessorios
```

That is the whole convention. Strip the scheme and `www.`, keep the path. No
extension, no key, no login, no SDK — the URL is the API, because the agents we
want are already holding a URL and have nothing installed.

Nothing is crawled ahead of time. The first request resolves *that one URL*
against the merchant's own public catalog API, renders it, and stores it — so any
URL works immediately, and costs nothing the second time.

## Surfaces

| Route | Returns |
|---|---|
| `/{domain}` | Storefront overview: categories, best sellers, the terms its own shoppers search for. Start here. |
| `/{domain}/{any storefront path}` | Product or category listing as Markdown |
| `?page=N` | Paginate a listing |
| `?sort=price_asc` | Order the **whole catalog**, not just the page you were handed. Also `price_desc`, `name_asc`, `name_desc`, `discount`, `new`. |
| `/{domain}/search?q=` | Search that storefront. `/busca/{words}` works too — it is the path the store itself uses. |
| `....json` | Any of the above as structured JSON instead of Markdown |
| `/llms.txt` | Machine index: the convention, and the storefronts checked to work |
| `/benchmark` | Measured cost of reading a storefront both ways |
| `POST /feedback` | Tell us a document is wrong. Public, unauthenticated, rate-limited per IP. |
| `/about`, `/opt-out` | The service itself |

Markdown is the default representation — **no extension needed**. `.md` is
accepted and identical; `.json` is the same document structured.

A product page carries frontmatter (canonical URL, platform, currency, observed
price, availability), a variant table with a **cart link per in-stock SKU** that
builds a cart on the merchant's own checkout, the facts the platform asserts, and
an explicit statement of what is *not* verified.

## What it does not answer

Live stock for a chosen variant, final price after cart promotions and coupons,
delivery dates for an address, anything priced for one shopper. Those belong to
the merchant and change by the second. Every response states the boundary rather
than guessing — an agent that promises what a merchant cannot honour costs the
merchant a return, a support ticket and a customer.

## Supported platforms

**VTEX** and **Shopify** — both address their catalog JSON with the same paths
their storefront uses, which is what makes a URL swap possible without a crawl.
See `src/server/platform/detect.ts`.

Wake requires a per-merchant `TCS-Access-Token`, so it cannot work zero-config; it
belongs to the paid tier. Everything else returns an honest "could not read this"
rather than a guess.

## Architecture

One Cloudflare Worker, two bindings, no build step.

```
GET /{domain}/{...path}[.md|.json]
  1. Cache API                      hit -> return
  2. KV  md:{domain}{path}          hit -> return (+ refresh in waitUntil if stale)
  3. miss: registry -> platform (detect once, ever)
           resolve()  <= 2 upstream calls, 6s each
           render     -> Markdown or JSON
           waitUntil: KV put (no TTL), D1 event
```

**D1** holds the registry (which domain is on which platform, at which origin)
plus the append-only `events` table and agent feedback. **KV** holds the rendered
documents, written *without* a TTL — that is the index, not a cache. Only
negative results expire.

Reads are bounded and never crawl: at most two upstream calls, rate-limited per
merchant domain, negative-cached. A read never enumerates a catalog and never
renders HTML. That bound is what stops anyone using this as an amplifier against a
storefront — and it is why `?q=` and `?sort=` are served by the merchant's own
search and catalog endpoints rather than by an index of ours.

`/mcp` is a **private** operator control plane (feedback triage, traffic stats),
guarded by one bearer secret and failing closed when unset. It is not the product;
the URL is.

More detail, including the gotchas already paid for, in `CLAUDE.md`.

## Run it

```sh
npm install
npm run db:local            # apply migrations to the local D1
npm run dev                 # http://127.0.0.1:8799
npm run smoke               # end-to-end checks against live storefronts
npm run check               # tsc --noEmit
```

`npm run smoke <url>` also works against a deployed instance. It discovers an
in-stock product rather than hardcoding one, because a hardcoded SKU passes until
it sells out and then reports a bug that isn't there.

## Deploy

```sh
wrangler d1 create decoindex
wrangler kv namespace create CACHE
# paste both ids into wrangler.jsonc, and set your own account_id
npm run db:remote
npm run deploy
```

Optional: `wrangler secret put MCP_AUTH_TOKEN` to enable the private control
plane. Without it `/mcp` answers 503 and everything else works.

## The benchmark

`/benchmark` is rendered from `bench/results/latest.json`, which is produced by
`bench/run.mjs` and committed. Nothing on that page is typed in by hand.

```sh
npm run bench                                  # layer 1, free, ~1 min
node bench/run.mjs --base http://127.0.0.1:8799
node bench/run.mjs --agents --reps 3           # layer 2, costs real money
```

**Layer 1** fetches one in-stock product from each brand in `bench/brands.json`
twice — as the HTML the storefront hands a browser, and as the document we serve
for the same URL — and records bytes, tokens, latency and whether the price is
present at all. No key, no account.

**Layer 2** hands a headless `claude -p` one URL and one shopping question per arm
and grades the answer. It needs a logged-in `claude` CLI and spends real money.
Every transcript lands in `bench/results/runs/` so any grade can be checked
against what the model actually said.

Two things the harness is deliberate about:

- **Ground truth never comes from decoindex.** Both the product under test and the
  facts checked against it come from the merchant's own catalog API, so the
  benchmark cannot grade us against our own output. It measures what it costs an
  agent to recover a fact the merchant already published — not whether we copied
  it correctly.
- **Storefront outcomes are kept apart, never averaged.** A bot challenge is a
  small response and so is a soft 404; folding either into "storefront payload
  size" would invent a flattering number. Rows are tagged `ok`, `js-shell`,
  `blocked` or `mismatch`, and only `ok` rows enter the token ratio.

Set `ANTHROPIC_API_KEY` for exact token counts from the count-tokens endpoint;
without it, counts are estimated at 4 bytes/token and labelled as such on the page.

## Merchants

We are a channel, not a competitor. Every mirrored response carries
`x-robots-tag: noindex` and `rel=canonical` to the merchant, images are never
rehosted, and every outbound product link carries an attribution param. We
identify ourselves as `decoindex/1.0 (+https://decoindex.com/about)` in every
request and do not work around blocks.

To remove a domain: `decoindex.com/opt-out`.

## Not built

An index of our own — bulk ingestion, embeddings, cross-storefront search (the
paid tier). Merchant auth for claiming a domain. Wake. Any platform beyond VTEX
and Shopify.

## License

[AGPL-3.0](LICENSE). Built by [deco](https://decocms.com).
