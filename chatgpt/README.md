# decoindex as a Custom GPT

Zero-setup path: text/markdown only, no widget (Custom GPTs can't render one
— see `docs/PUBLISHING.md` for the Apps SDK/widget path instead). Doesn't
touch `/mcp`, so it ships independent of the auth question there.

## Setup (GPT Builder)

1. chatgpt.com → **Create a GPT** → **Configure**.
2. **Instructions:**
   ```
   You help shoppers find products across Brazilian storefronts (VTEX/Shopify)
   resolved live by decoindex. Use searchStorefront with the merchant's
   domain (no scheme, no www — e.g. farmrio.com.br) and the shopper's query.
   Use sort=price_asc/price_desc when the user cares about cheapest/most
   expensive — it orders the whole catalog, not just the page returned.

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
5. Test in the preview pane: `farmrio.com.br, vestido longo`.
6. Publish → **Anyone with the link** (or submit to the GPT Store separately,
   optional, later).

## Why only one action

`searchStorefront` already returns full product detail per hit (variants,
price, availability, claims) — confirmed against the live endpoint, not
assumed. A separate "get exact product by URL" action was left out: VTEX
slugs are multi-segment (`/vestido-.../p`), which doesn't map cleanly onto a
single OpenAPI path parameter without a slash-encoding risk that wasn't
verified against the live server. Add it later if a shopper needs to
re-open one exact product rather than searching again.
