# decoindex

Agent-readable mirrors of ecommerce storefronts.

Swap the origin of any VTEX or Shopify storefront URL and get normalized Markdown
instead of client-rendered HTML:

```
https://www.farmrio.com.br/moda-feminina/acessorios
https://decoindex.com/farmrio.com.br/moda-feminina/acessorios
```

Nothing is crawled ahead of time. The first request resolves that one URL against
the merchant's own public catalog API, renders it, and stores it — so any URL
works immediately, and costs nothing the second time.

## Surfaces

| URL | What |
|---|---|
| `/{domain}/` | Storefront overview: categories and URL conventions |
| `/{domain}/{any storefront path}` | Product or listing as Markdown |
| `…?page=N` | Paginate a listing |
| `….json` | The same document, structured |
| `/{domain}/llms.txt` | Per-storefront machine index |
| `/llms.txt`, `/about`, `/opt-out` | The service itself |

A product page carries frontmatter (canonical URL, platform, currency, price,
availability), a variant table with a **cart link per in-stock SKU** that builds a
cart on the merchant's own checkout, the product facts the platform asserts, and
an explicit statement of what is *not* verified.

## Supported platforms

**VTEX** and **Shopify** — both address their catalog JSON with the same paths
their storefront uses, which is what makes a URL swap possible without a crawl.

Wake requires a per-merchant `TCS-Access-Token`, so it cannot work zero-config; it
belongs to the paid tier. Everything else returns an honest "could not read this"
rather than a guess.

## Run it

```sh
npm install
npm run db:local            # apply migrations to the local D1
npm run dev                 # http://127.0.0.1:8799
npm run smoke               # end-to-end checks against live storefronts
npm run check               # tsc --noEmit
```

`npm run smoke <url>` also works against a deployed instance.

## Deploy

```sh
wrangler d1 create decoindex
wrangler kv namespace create CACHE
# paste both ids into wrangler.jsonc
npm run db:remote
npm run deploy
```

Two bindings, both cheap: **D1** holds the registry (which domain is on which
platform, at which origin) plus the append-only `events` table. **KV** holds the
rendered documents, written *without* a TTL — that is the index, not a cache.
Negative results are the only entries that expire.

## Architecture

See `CLAUDE.md`. The short version:

```
GET /{domain}/{...path}
  1. Cache API                      hit -> return
  2. KV  md:{domain}{path}          hit -> return (+ refresh in waitUntil if stale)
  3. miss: registry -> platform (detect once, ever)
           resolve()  <= 2 upstream calls, 5s each
           render     -> Markdown or JSON
           waitUntil: KV put, D1 event
```

Reads are bounded and never crawl: at most two upstream calls, rate-limited per
merchant domain, negative-cached. That bound is what stops anyone using this as an
amplifier against a storefront.

## Not built

Search and proactive indexing (the paid tier), merchant auth for claiming a
domain, Wake, and any platform beyond VTEX and Shopify.
