# decoindex as a Custom GPT

Zero-setup path: text/markdown only, no widget (Custom GPTs can't render one
— see `docs/PUBLISHING.md` for the Apps SDK/widget path instead). Doesn't
touch `/mcp`, so it ships independent of the auth question there.

## Setup (GPT Builder)

1. chatgpt.com → **Create a GPT** → **Configure**.
2. **Instructions:**
   ```
   You help shoppers find products across Brazilian storefronts (VTEX/Shopify)
   resolved live by decoindex. Call searchStorefront with the merchant's
   domain (no scheme, no www — e.g. farmrio.com.br) and the shopper's query.
   Use sort=price_asc/price_desc when the user cares about cheapest/most
   expensive — it orders the whole catalog, not just the page returned.

   searchStorefront returns a compact table (title, price, stock, a Details
   link per row) on purpose. When the user wants to see one item in full —
   composition, sizes, all photos — call getProduct with that row's Details
   link, using only the part after the domain as path (drop the leading
   slash and the .json). Don't guess a path from a URL the user pasted
   themselves; only use paths that came from a searchStorefront result.

   Reads happen live against the merchant's own catalog, not a stale index —
   but every fact is still a snapshot at read time, never a live stock or
   final-price guarantee. Never state stock, final price after promotions,
   or delivery dates as certain — always tell the user to confirm on the
   merchant's own page before they buy. A non-200 response means the store
   couldn't be reached or the fetch was refused (bot protection); tell the
   user that and suggest trying again shortly — it's not permanent.
   ```
3. **Actions** → **Create new action** → paste the contents of
   `chatgpt/openapi.json` into the schema box. (There's no server route
   serving this file — it's schema for the Action, not something decoindex
   itself needs to host. That's also why this whole path needs zero deploy.)
4. Auth: **None** — the endpoint is public and read-only by design.
5. Test in the preview pane: `farmrio.com.br, vestido longo`, then ask for
   detail on one result to exercise `getProduct` too.
6. Publish → **Anyone with the link** (or submit to the GPT Store separately,
   optional, later).

## Two actions, and why the split

`search.json` (the obvious first choice) returns full detail per hit —
variants, images, every claim — and a 24-result page of that came to
**~170KB**, over GPT Actions' response-size cap (`ResponseTooLargeError`,
hit live during setup). The plain-Markdown `search` endpoint is the same
query, same ranking, ~7KB: title, price, stock, a link. `getProduct` exists
so a shopper can still get the full picture on one item without paying that
cost for all 24.

`getProduct`'s `path` parameter deliberately captures a multi-segment VTEX
slug (`vestido-.../p`) as one opaque string — OpenAPI path parameters are
single-segment by spec, but GPT Actions percent-encodes the internal `/` as
`%2F`, and decoindex's router decodes it back correctly. Confirmed live
(`.../slug%2Fp.json` → 200, same content as the literal-slash URL), not
assumed — the multi-segment risk that had this action left out entirely in
an earlier version of this file is resolved.
