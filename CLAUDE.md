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

**1. Reads never crawl.** A request is served from the edge cache, from the
Durable Object, or as a `queued` stub. Fetching a merchant page inside a
request handler is forbidden — it would let anyone knock us over, and it puts
our latency at the mercy of someone else's storefront. All fetching happens on
the queue, driven by cron or by a job a read enqueued.

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
  GET *  -> parsePath -> Cache API -> StorefrontDO -> Markdown/JSON
  POST /mcp   -> src/server/mcp.ts -> same DO, same cache, JSON-RPC in/out
  queue()     -> ingest pipeline
  scheduled() -> refresh the 20 stalest storefronts, hourly

StorefrontDO   one per domain, idFromName(domain)
  SQLite: products, variants, terms (inverted index), vectors (int8)
  hybrid search: BM25 + cosine, fused with RRF

D1   the registry (which domains exist) + first-party events
R2   raw source snapshots (reprocess without re-crawling)
KV   per-domain ingest locks
```

Ingestion never renders pages when it can avoid it. Platform detection decides
everything: VTEX and Shopify hand over the whole catalog as JSON. That is why
`src/server/ingest/detect.ts` matters more than it looks.

## Conventions

- `src/server/env.ts` mirrors `wrangler.jsonc` by hand. Secrets are optional so
  unconfigured features degrade instead of crashing.
- `npm run check` (`tsc --noEmit`) stays green. Always.
- Business logic is plain functions taking `env`. Routes, queue consumers and
  scripts all call the same functions; nothing is coupled to a transport.
- Tokenization lives in one module (`lib/text.ts`) because index time and query
  time must agree exactly. Never inline a second tokenizer.
- Prices are integers in centavos. No floats anywhere near money.

## The MCP surface (`/mcp`)

A tool call is a read, full stop — it obeys the three invariants above like
any GET route, and reuses their code rather than reimplementing it:
`getDomain`/`upsertDomain` for the queued-stub path, `render/markdown.ts` for
the text a model reads, `lib/url.ts#cacheKey` for cache identity. The one
thing POST changes: the Cache API never caches POST, so `mcp.ts` builds the
same cache key by hand and checks `caches.default` itself before touching the
DO — a tool call and its REST equivalent (e.g. `search_storefront` and
`/{domain}/search?q=`) land in the **same cache entry**. Skipping that check
before adding a new tool reopens the AI-cost hole a rate limit alone doesn't
close (`embedOne()` still runs once per miss).

The widget (`render/widget.ts`) renders a third-party merchant's own catalog
data inside a sandboxed iframe on someone else's platform — treat every field
in it as attacker-controlled. No `innerHTML` with catalog data, ever; DOM is
built with `createElement`/`textContent`, and every `href`/`src` goes through
`safeUrl()` (https-only, image hosts additionally allowlisted).

## Gotchas already paid for

1. DO SQLite row types need `extends Record<string, SqlStorageValue>` or `exec<T>`
   refuses them.
2. Vectors are cached in DO memory (`vecCache`) and invalidated on write. Reading
   10MB of blobs per query from SQLite is the difference between 5ms and 500ms.
3. VTEX refuses `_to` beyond 2500. Past that, paginate by category, not offset.
4. Shopify `/products.json` pages are 1-indexed; VTEX cursors are 0-indexed
   offsets. `pipeline.ts` tracks both in the same `cursor` field — read it.
5. Queue retries only on total failure. Upserts are idempotent, so a half-applied
   catalog page is fine; the next cron pass finishes it.
6. Embeddings must be multilingual (`bge-m3`). An English-only model ranks a
   pt-BR catalog as noise, silently.
7. `upsertDomain()`'s bind list must match `domains`' `NOT NULL DEFAULT` columns
   explicitly (`"unknown"`/`10`/`0`, not `null`) — an explicit bound `NULL` on
   `INSERT` overrides a column default, which only fires for an *omitted*
   column. Passing `null` there 500s on the very first read of any new domain.

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
