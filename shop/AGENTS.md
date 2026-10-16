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

Own Workers Build with root directory `shop/`, build `npm run build`, deploy
`npx wrangler deploy`. Secrets: `CF_AI_GATEWAY_TOKEN`, `OPENROUTER_API_KEY`
(`wrangler secret put …`, typed by a human).
