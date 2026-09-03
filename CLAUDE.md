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
platform API — at most two upstream calls, a 6s timeout each, rate-limited per
domain, and negative-cached. A read never enumerates a catalog and never renders
HTML. A cold domain additionally pays one detection handshake (5s), once, ever.

This is what makes "swap the origin and it just works" true, and the bound is
what stops anyone using us as an amplifier against a storefront. Note what is
*not* a violation: `?q=` and `?sort=` are served by the merchant's own search
and catalog endpoints, so they stay inside the two-call bound. What is still
unbuilt is an index of *ours* — bulk ingestion, embeddings, cross-storefront
search. That is the paid tier and it runs off the request path. If you find
yourself adding a third upstream call to a read, you are building the wrong
thing.

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
Worker (Hono)  src/server/main.ts        — one file owns every route
  GET /{domain}/{...path}[.md|.json]     — the catch-all, and the product
    1. Cache API          hit -> return
    2. KV  md:{domain}{path}   hit -> return (+ refresh in waitUntil if stale)
    3. miss:
         D1 registry -> platform, or detectPlatform() once
         platform/resolve() -> Doc      <= 2 upstream calls, 6s each
         render/markdown.ts -> Markdown or JSON
         waitUntil: KV put (no TTL), D1 event

src/server/platform/   detect.ts + vtex.ts + shopify.ts, one resolve() each
                       + brand.ts (one homepage read per domain, ever)
                       + order.ts, tree.ts (sorting, category trees)
src/server/render/     markdown.ts (documents), landing.ts (/), benchmark.ts
                       (/benchmark), chrome.ts (shared HTML shell)
src/server/mcp/        the PRIVATE control plane behind /mcp — see below
src/server/lib/        url.ts (parse + cache keys), store.ts (KV), registry.ts
                       (D1 + UA classification), feedback.ts, types.ts

D1   registry: which domains exist, platform, origin, account, currency
     + the append-only events table + feedback + the improvement-loop tables
KV   rendered documents. Written WITHOUT a TTL — this is the index, not a cache
```

Markdown is the default representation: no extension means `.md`. `.json` is the
same document structured. Both collapse to one cache entry (`cacheKey` strips
`.md`), so never teach the suffix as required — "swap the origin" is the pitch
and an extension contradicts it.

**`/mcp` is two tiers on one URL, and is not the product.** The URL is the
product; `/mcp` is the same reads for hosts that prefer a tool call. See "The MCP
surface" below for the tiers and the rules a tool has to follow.

Other routes: `/` (HTML for browsers, 302 to `/llms.txt` for agents), `/llms.txt`,
`/about`, `/opt-out`, `/benchmark` (static, from committed bench results),
`/feedback` (public, unauthenticated, IP rate-limited), `/robots.txt`, `/og.png`,
`/healthz`, `POST /e` (cookieless landing beacon). `/{domain}/llms.txt` 308s to
`/{domain}` — one index per storefront, because pointing agents at a second
thinner one cost us a real reader.

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

## The MCP surface (`/mcp`)

**A tool call is a read, full stop.** It obeys the three invariants above
exactly like a GET route, and must reuse their code rather than reimplement it:
`getDomain`/`upsertDomain` for the registry, `render/markdown.ts` for the text a
model reads, `lib/url.ts#cacheKey` for cache identity. A tool that resolves a
storefront URL goes through the same bounded `resolve()` as everything else.

The one thing POST changes: **the Cache API never caches POST.** A tool handler
has to build the same cache key by hand and check `caches.default` itself, so a
tool call and its REST equivalent land in the *same* cache entry instead of the
tool path quietly costing an upstream call on every invocation.

**Two tiers, one URL** (`mcp/auth.ts`). No token: the public read tools in
`mcp/public.ts`. Valid `MCP_AUTH_TOKEN`: those plus the control plane in
`mcp/tools.ts`. A *wrong* token is 401, never a silent downgrade — an operator
who typo'd should be told, not left wondering where their tools went.

The public tier must work unauthenticated, and that is a hard requirement rather
than a preference: ChatGPT calls `initialize` and `tools/list` before a human has
anywhere to type a token, so a 401 there does not read as "locked down", it reads
as "cannot be installed". It read that way for a while, and blocked the app.

`tools/call` resolves the name against *that caller's* tier, so an anonymous
guess at `feedback_update` gets "unknown tool" rather than a 403 that would
confirm the tool exists.

Host UI is published in **two dialects, because two hosts disagree and neither
reads the other's**. Get this wrong and the screen is invisible rather than
broken, which is much harder to notice:

| | deco Studio (MCP Apps) | OpenAI (Apps SDK) |
|---|---|---|
| resource mimeType | `text/html;profile=mcp-app` | `text/html+skybridge` |
| tool pairing | `_meta.ui.resourceUri` | `_meta["openai/outputTemplate"]` |
| data delivery | JSON-RPC over `postMessage` | `window.openai.toolOutput` |

`render/dashboard.ts` is published under both URIs and detects its host at
runtime, so the duplication stops at the manifest.

**The MCP Apps handshake has three steps and the third is the one people miss:**
request `ui/initialize` (protocol `2026-01-26`), *then send the
`ui/notifications/initialized` notification*, and only then call tools. The host
holds its loading spinner until that notification arrives — an app that
initializes and goes straight to `tools/call` looks connected from its own side
and renders "loading app…" forever. The host also sends requests (`ping` at
minimum); answer every one, because an unanswered request strands the host.

Opening a view does not deliver a tool result — the host only pushes one when a
user invoked the tool — so an app fetches its own data with `tools/call` rather
than waiting to be handed it.

`GET /mcp/ui` serves the same HTML with data inlined, which is the only way to
look at the screen outside a host.

For the Apps SDK specifically: tool descriptors carry `title`, `outputSchema` and
`annotations.readOnlyHint`; `initialize` echoes the client's `protocolVersion`
rather than asserting ours, because a host that asked for an older revision and
is answered with a newer one treats the mismatch as fatal.

That widget renders a **third-party merchant's** catalog data inside a sandboxed
iframe on someone else's platform — treat every field in it as
attacker-controlled. No `innerHTML` with catalog data, ever; build DOM with
`createElement`/`textContent`, and pass every `href`/`src` through `safeUrl()`
(https-only, image hosts additionally allowlisted).

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
7. **VTEX refuses `_to` beyond 2500.** Past that, paginate by category, not by
   offset. (Inherited from the ingestion prototype; still true of the API.)
8. **Shopify `/products.json` pages are 1-indexed; VTEX cursors are 0-indexed
   offsets.** Easy to conflate when touching pagination in either resolver.

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

## Shipping

**`main` deploys itself. Never run `wrangler deploy` by hand.**

A push to `main` triggers the build, so a merged commit is a deploy. The one
thing that must stay true is that `main` is always what is live — the drift that
cost a day earlier came from exactly the opposite habit, a local branch running
in production while `git log` described something else. A manual deploy
re-creates that gap the moment it succeeds from a dirty tree.

So: land it on `main` and let the build ship it. Verify after, against the real
origin:

```
npm run check                     # tsc, before pushing
npm run smoke https://decoindex.com   # after the build lands
```

If something must go out without a commit, that is an incident, not a workflow —
say so out loud rather than reaching for the CLI.

## Autonomy ends at consequence

You own: code, schema, cache policy, ranking, deploys, analysis.
Ask a human first for: emailing merchants, changing what we publish about a
domain that asked to be removed, anything that spends money, deleting event
history, and any change that weakens the three invariants above.
