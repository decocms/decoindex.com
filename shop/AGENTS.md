# deco shop — `shop.decoindex.com`

Chat to browse Brazilian fashion catalogs (FARM, Animale, Osklen, Reserva, FILA,
New Balance…) from one place. A daydream.ing-style proof of concept, deco-branded.

It is a **separate Worker** (`decoindex-shop`) living in the decoindex repo. The
parent `../CLAUDE.md` invariants still bind it: it is a *consumer* of decoindex,
never a second path to the merchants.

## Shape

```
worker-entry.ts   POST /api/chat  → server/chat.ts (NDJSON stream)
                  POST /api/event → events table (feedback, dismiss, open)
                  GET  /go        → logged 302 to a roster merchant PDP (no open redirect)
                  everything else → @decocms/tanstack (CMS pages + Studio admin)

server/chat.ts    AI SDK streamText, two tools:
                    search_catalogs  fan-out ≤6 searches → INDEX binding → decoindex /{domain}/search.json
                    show_products    the model's curated ids, in order
                  model = OpenRouter via Cloudflare AI Gateway ("default", authenticated)
server/brands.ts  the roster (domains decoindex already reads) — edit here to add a brand
sections/         ShopChat (the whole app), BrandStrip — props editable in deco Studio
.deco/blocks/     page content (source of truth); *.gen.* files are generated, never hand-edit
```

Design language is lifted from `deco-sites/demo-storefront` (Switzer, monochrome,
frost glass, tap-scale, 372/498 cards). Reuse its tokens before inventing new ones.

## Sharing (`/s/{id}`)

When a turn finishes with curated tiles, `chat.ts` freezes it into KV `SHARES`
(`s:{id}`, 1 year) and emits `{type:"share"}`. The snapshot is built **server
side from tiles the server fetched** — never accept tiles from the client, or
anyone could publish fake products/links under our domain. `/s/$id` is SSR from
KV (no LLM), `noindex`, with OG title/description/image (image = merchant CDN,
resized by it). Prices on it are labeled with the date they were seen.

## Partner widget (`/embed.js`)

One tag on a store's empty-search page:

```html
<script src="https://shop.decoindex.com/embed.js" async></script>
<!-- or explicit: data-q="vestido azul" data-target="#no-results" -->
```

Reads the term from `data-q`, `?q=`, `?ft=` or `/busca/{q}`, renders a card in
Shadow DOM (textContent only), links to `/?q=…&store={host}`. `store=` makes the
chat search that store first and show it on top (only roster domains honored).

## Rules

- **Search goes through decoindex only** (service binding `INDEX`). Never call a
  merchant API from here. The binding forwards the shopper's IP as
  `cf-connecting-ip`, so decoindex's per-caller limit counts shoppers, not us.
- **Never rehost images.** Tiles hotlink the merchant CDN; `thumb()` only asks
  that same CDN for a smaller size.
- **Catalog price ≠ final price.** Copy and the system prompt never promise
  stock, shipping or the final price. Every outbound link carries `ref=decoshop`.
- **Never hardcode a model.** `CHAT_MODELS` (wrangler var) lists the candidates;
  each chat is pinned to one by hashing its id. `?model=<slug>` forces one.

## Cost: this is a research project, and cheap is a requirement

The shop exists to learn how agents browse catalogs cheaply. A change that makes
it smarter by making it expensive has failed, even if the results look better.

- **Price it before building it.** Write down cost and latency per shopper action
  (a search, a "Mais como este", a page view) *before* coding: tokens × calls ×
  price. If one action costs more than ~US$0.005, find a cheaper design first.
- **One image per call, at most.** Images are the most expensive input there is.
  Never send a grid of candidate thumbnails to a vision model (24 thumbnails was
  ~27k tokens and US$0.02 per click on Gemini). If a photo matters, send *the
  seed's* photo once, small (`thumb(url, 480)`), and turn it into text (color,
  print, silhouette) that cheap steps can reuse.
- **Cheapest step that can decide, decides.** Rules and heuristics first, then Jev
  (`src/server/jev.ts`: typed scores, ~US$0.0003 per 50-90 items, input-only
  billing), and a reasoning model only where something has to be written or planned.
  Reasoning models get `reasoning: { effort: "minimal" }` unless a test shows it hurts.
- **Measure, don't assume.** Every model call logs its cost (`meta.cost` on
  `shop.chat` / `shop.similar`, summed per turn). A change that touches the AI path
  ships with an A/B on preview (same queries, both arms, average tokens / cost /
  latency) in its PR, like the Jev one (−59% tokens, −40% cost).
- **Cache what repeats.** Opening answers are cached a day; snapshots (`?s=`,
  `/s/`) reopen from KV for free. Prefer serving a snapshot to re-running a search.

## Admin (`/mcp`)

`shop.decoindex.com/mcp?token=…` is an MCP app (add it in deco Studio as a URL;
the token rides as `?token=` because Studio stores only the URL). Tools:
`shop_dashboard` (opens the visual panel), `shop_queries`, `shop_top_queries`.
`GET /mcp/ui?token=…` shows the same panel in a browser. Fails closed: no
`MCP_AUTH_TOKEN` secret → 503; missing/wrong token → 401; no public tier, it
shows what shoppers typed. Code: `src/server/admin/*`, handshake rules copied
from decoindex's `/mcp` (read its comments before changing the widget).

**Our own traffic is "dev", and the admin hides it by default** (toggle "Esconder
uso dev"). Every event from a request that `isDev()` recognises logs with
`ua_class = 'dev'`: a user agent containing `decoshop-dev` (every test script
sets it: Playwright `userAgent: "… decoshop-dev"`, curl `-A decoshop-dev`), the
`decoshop_dev=1` cookie that `shop.decoindex.com/dev` sets (`/dev?off` clears
it; the admin links to it), or `utm_source=test`. Older test runs are filtered
by their tags (test- chat ids, utm_source=test, HeadlessChrome).

**Scanners and missing pages.** Paths only scanners ask for (`SCAN` in
`traffic.ts`: `.env`, `wp-*`, `.php`, `.git`…) get a bare 404 before anything
renders or logs. Other missing pages render the 404 page, but an IP past
`SCAN_LIMIT` (20/min) is blocked for an hour (KV `block:{ip}`, expires on its
own, logged once as `shop.block`, counted in the admin). Visitors in the admin
are views of pages that exist; missing pages are counted apart. Returning
visitors: a `ds_first` cookie holds only the first-visit date (no identifier).

## Learning in production

Every chat, click, open, dismiss and 👍/👎 lands in decoindex's `events` table
with `surface='shop'` and `meta.model`. AI Gateway logs carry the same
`cf-aig-metadata` (`chat`, `model`) for latency/cost per call.

```
wrangler d1 execute decoindex --remote --command "
  SELECT json_extract(meta,'$.model') m, name, COUNT(*) n
  FROM events WHERE surface='shop' AND ts > date('now','-7 days')
  GROUP BY 1,2 ORDER BY 1,2"
```

Click-through per chat (`shop.click` / `shop.chat`) is the number that decides
the model, not 👍.

## Gotchas already paid for (TanStack Start + deco blocks + Workers)

1. **`cloudflare:workers` never at module level of a file the client imports.**
   Only inside a `createServerFn` handler (the compiler strips it from the client
   bundle) or in a `*.server.ts` file loaded via dynamic `import()` from the
   handler. Module-level use made Vite try to resolve it in the browser build.
2. **`DecoRootLayout` already renders the route outlet.** Passing
   `<StableOutlet/>` as its child rendered every page twice.
3. **Async UI state is patched by identity, never "the last item".** A stream
   that patched "the last turn" let an aborted request finish the *new* turn and
   leave itself spinning forever. Give each turn a key; write only into it.
4. **Every user-initiated step is a `history.pushState`.** `replaceState` made
   Back leave the site. Back must step through state already in memory (no new
   model call), and asking from an earlier step branches, like browser history.
5. **Don't show raw results and then swap in curated ones.** It reads as a
   glitch. Show progress (found N in K stores) until the curated set arrives,
   and accept only one curation per turn.
6. **Tailwind v4 preflight sets `cursor: default` on buttons** — fixed globally
   in `app.css`. Arbitrary `calc()` needs `_` for spaces
   (`calc((100vw_-_1280px)/2_+_2rem)`) or it is silently dropped.
7. **VTEX image resize: `-{w}-auto`, never `-{w}-{h}`.** A fixed box is
   letterboxed in white.
8. **`og:url` never in the root route** — child routes (e.g. `/s/{id}`) inherit
   it and link unfurlers canonicalize every share to the home card.
9. **`.deco/sections.gen.ts` reorders itself on every build.** Same imports,
   different order: discard the diff, don't commit it.
10. **Edge-cached HTML survives a deploy for ~15 min.** Check a fresh deploy with
    a different segment (mobile UA) or wait; the cache key carries the build hash.

## Dev

```
bun install
cp .dev.vars.example .dev.vars   # fill in yourself — secrets never go through an agent
npm run dev                      # generates blocks/sections/routes, then vite on :5173
npm run check                    # tsc, stays green
```

`INDEX` is a remote binding in dev, so local searches hit the real decoindex.
Local D1 is empty, so event inserts log an error and move on — expected.

## Shipping

Workers Build on the `decoindex-shop` Worker: repo `decocms/decoindex.com`, root directory
`shop`, build `bun run build`, deploy `npx wrangler deploy`, watch path `shop/*`. A merge to
`main` deploys. Secrets: `CF_AI_GATEWAY_TOKEN`, `OPENROUTER_API_KEY` (`wrangler secret put …`,
typed by a human).

**Previews come from the PR.** Workers Builds runs `npx wrangler preview` for every branch: a
Worker Preview named after the branch, URL posted on the PR. Its config is the `previews` block in
`wrangler.jsonc`, deliberately on production's KV, D1, rate limit and catalog binding (tag test
traffic). Preview secrets are separate from production's: `wrangler preview base-config secret put
CF_AI_GATEWAY_TOKEN` (piped, never typed into a transcript) — without it Jev and the chat fail.
By hand: `npm run build && npx wrangler preview --name <name>`, then `git checkout -- .deco`.
There is no separate preview Worker any more.
