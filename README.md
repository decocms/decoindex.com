# decoindex

Agent-readable mirrors of brand storefronts. Put `decoindex.com` in front of any
storefront URL and get normalized product facts as Markdown or JSON, with
provenance and a stated freshness boundary.

```
https://www.farmrio.com.br/vestido-longo-alca-estampado/p
https://decoindex.com/farmrio.com.br/vestido-longo-alca-estampado/p.md
```

One Cloudflare Worker. No MCP server, no login, no SDK — the URL is the API,
because the agents we want are already holding a URL and have nothing installed.

## Surfaces

| Route | Returns |
|---|---|
| `/{domain}` | Storefront overview: platform, coverage, categories, how to query |
| `/{domain}/{path}.md` | A product page as normalized Markdown |
| `/{domain}/{path}.json` | The same record, strict JSON |
| `/{domain}/search?q=` | Hybrid lexical + semantic search over the whole catalog |
| `/{domain}/c/{category}` | Category listing |
| `/{domain}/llms.txt` | Index of everything, in the format agents look for |
| `/{domain}/products.json` | Full normalized catalog |

Search is the point. Mirroring a PDP is a commodity; brand site search is
uniformly bad, and it is exactly where an agent gives up.

## What it does not answer

Live stock, final price after promotions, delivery dates, personalized offers.
Those belong to the merchant and change by the second. Every response labels the
boundary rather than guessing.

## Architecture

```
Worker (Hono) ── Cache API ── StorefrontDO (one per domain)
                                 SQLite: products, variants,
                                 inverted index, int8 vectors
      │
      ├── D1     registry of domains + first-party events
      ├── R2     raw source snapshots
      ├── KV     per-domain ingest locks
      └── Queue  discover → catalog → embed  (cron-driven, never on read)
```

Reads never crawl. An unknown domain gets a `queued` stub in milliseconds and a
low-priority ingest job — which is also the rate-limit story.

Ingestion prefers structured feeds over rendering: VTEX `catalog_system` and
Shopify `products.json` return whole catalogs as JSON, so a 10k-SKU brand is a
few hundred requests instead of 10k page renders. `schema.org` JSON-LD is the
fallback for everything else.

## Quickstart

```bash
npm install
cp .dev.vars.example .dev.vars

npx wrangler d1 create decoindex
npx wrangler kv namespace create LOCKS
npx wrangler r2 bucket create decoindex-snapshots
npx wrangler queues create decoindex-ingest
npx wrangler queues create decoindex-ingest-dlq
# paste the printed ids into wrangler.jsonc

npm run db:local
npm run dev
```

Then:

```bash
curl 'http://localhost:8787/farmrio.com.br'                     # queues an ingest
curl 'http://localhost:8787/farmrio.com.br/search?q=vestido+longo'
```

Deploy once by hand (`npm run deploy`), then connect the repo to Workers Builds
so every push to `main` ships and every PR gets a preview URL.

## Seeding

The registry starts from the brands already tracked in Vitrine — platform known,
priority high — so the index is useful before anyone pastes a URL:

```bash
npm run seed brands.json | npx wrangler d1 execute decoindex --remote --file=-
```

## Status

Built and typechecking:

- domain routing, cache policy, canonical + noindex headers
- StorefrontDO with catalog storage, BM25 inverted index, int8 vectors, RRF fusion
- VTEX + Shopify + JSON-LD ingestors, platform detection, robots.txt for HTML fetches
- queue pipeline (discover → catalog → embed), hourly cron refresh
- all Markdown/JSON renderers, landing page, first-party analytics

Not built yet:

- merchant claim flow (`claims` table exists; no verification endpoint)
- R2 snapshot writing (bucket bound, pipeline does not persist raw payloads yet)
- Nuvemshop / Tray ingestors (detected, not ingested)
- AI Shopping Readiness scoring
- 90-day event pruning cron

## Legal posture

We identify ourselves in every request, respect `robots.txt` for HTML fetches,
never rehost images, publish normalized facts rather than merchant marketing
copy, mark every page `noindex`, point `rel=canonical` at the merchant, and
honour opt-out within 24h. This is not caution for its own sake: a merchant who
sees us as a competitor for their own traffic never becomes a customer.

MIT.
