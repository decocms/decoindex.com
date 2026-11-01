# circulei — a storefront proposal for circulei.co

`circulei.decoindex.com`: a city-first storefront for Circulei (peer-to-peer
fashion rental, Shopify) built on decoindex. A proposal for the founders, not
their production site: `noindex`, every rental goes to circulei.co with
`?ref=decoindex`.

## How it works

- **Catalog:** the whole public catalog (~260 pieces) is one KV snapshot
  (`circulei:snapshot:v1`), rebuilt hourly by cron from decoindex over the
  FirstParty binding (`/collections/all.json?page=N`, ≤20 reads, plus
  `bride-to-be`). A visit reads one KV key (memoised 5 min per isolate). A
  rebuild that shrinks the catalog by >30% is refused.
- **Location of a piece:** parsed from the listing text ("closet de: Paula B.
  São Paulo, SP …"), looked up in `src/geo.ts`. Cities with ≥5 pieces are hubs;
  smaller closets within 130 km join the nearest hub. Height, measurements,
  retail price, prova/ajuste are parsed from the same text (`parsePiece`, tested).
- **Visitor's city:** `?cidade=` (saved in a cookie), else the hub nearest to
  `request.cf` lat/lng, else São Paulo.
- **Search:** one Jev call scores every piece (~1s, ~US$0.001), cached 6h per
  ask in KV; nearby pieces get +0.15. A Haiku "curadora" note (≤45 words) loads
  after the grid, cached 24h per ask+city. Jev down → keyword fallback, labelled.
  `/api/*` is same-origin only and rate-limited per IP (SEARCH_LIMIT, 12/min).
- **Events:** decoindex D1 `events`, `surface = 'circulei'`, names
  `circulei.view` / `circulei.search`; `ua_class = 'dev'` for `decoshop-dev`.

## Run, test, deploy

```
bun run dev      # :8798, needs CF_AI_GATEWAY_TOKEN in .dev.vars
bun test         # parser + hub grouping
bun run check
npx wrangler deploy   # not on Workers Builds; deploy by hand from this folder
```
