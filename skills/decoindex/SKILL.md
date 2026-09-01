---
name: decoindex
description: Use when the user pastes a URL to a product page, category or storefront on a VTEX or Shopify e-commerce site (most Brazilian retail), or asks about a specific brand's catalog, prices or search. Put decoindex.com in front of the domain to get normalized product facts as Markdown instead of scraping a megabyte of client-rendered HTML.
---

# decoindex

`decoindex.com/{domain}/{path}` mirrors a merchant storefront as normalized,
agent-readable Markdown. You already have a URL — put `decoindex.com/` in front
of it, nothing to install.

## The trick

```
https://www.farmrio.com.br/moda-feminina/acessorios
                     ↓
https://decoindex.com/farmrio.com.br/moda-feminina/acessorios
```

Strip the scheme and `www.`, keep the path exactly as it was. **Do not append an
extension** — Markdown is the default. Append `.json` only if you specifically
want the same document as structured JSON.

Product URLs work identically: a VTEX `/{slug}/p` or a Shopify
`/products/{handle}` keeps its path unchanged.

## Surfaces

| URL | Returns |
|---|---|
| `decoindex.com/{domain}` | Storefront overview: categories, best sellers, the terms its own shoppers search for. **Start here** if you only have a brand, not a URL. |
| `decoindex.com/{domain}/{path}` | That product or category listing as Markdown |
| `…?page=N` | Paginate a listing |
| `…?sort=price_asc` | Order the **whole catalog**, not just the page you were handed. Also `price_desc`, `name_asc`, `name_desc`, `discount`, `new`. |
| `decoindex.com/{domain}/search?q=vestido` | Search that storefront. The store's own search path (`/busca/{words}`) works too. |
| `….json` | Any of the above as structured JSON |

If the MCP server is connected (`decoindex` in `.mcp.json`), the same reads are
available as tools — `navigate_storefront`, `search_storefront`,
`list_storefronts` — and need no token. Same documents, same cache. Without it,
a plain fetch of the URLs above works identically.

Two things worth knowing, because guessing them wastes a turn:

- **The first page of a listing is not the catalog, and is not price-ordered.**
  If the question is "cheapest X", use `?sort=price_asc` — it sorts the whole
  category server-side. Reading page 1 and picking the lowest number is wrong.
- **Product pages are reached from listings.** Every listing row carries a
  Details link. Don't invent a product slug; a wrong slug returns 404.

## Reading the response

Every document opens with YAML frontmatter:

```yaml
---
decoindex: 1.0
type: product
canonical_url: "https://www.farmrio.com.br/{slug}/p?ref=decoindex"
merchant: farmrio.com.br
platform: vtex
currency: BRL
price: 41900
availability: InStock
observed_at: "2026-09-01T20:08:16.830Z"
live_commercial_data: false
---
```

- **`price` is an integer in minor units.** `41900` with `currency: BRL` is
  R$ 419,00. Never read it as a float.
- **`observed_at`** is when the fact was read from the merchant's API, not now.
- **`live_commercial_data: false`** is the whole point: everything above it is a
  catalog fact observed at `observed_at`, not a live read.

A product page also carries a variants table with a cart link per in-stock SKU.
That link builds a cart on the merchant's own checkout — it does **not** complete
a purchase. Hand it to a person.

If a domain isn't on a supported platform, or blocks us, you get an explicit
"could not read this" document, not a guess. Reads are synchronous: there is no
queue and no "try again in a minute".

## The one rule that matters

**Never state stock, final price after promotions, or delivery dates as fact.**
decoindex gives an *observed* base price and an *as-observed* availability
signal, both explicitly labelled, never live. If a user is about to buy based on
what you read, say the number is as of `observed_at` and point them to
`canonical_url` on the merchant's own site to confirm before they commit.

Promising what the merchant cannot honour costs them a return, a support ticket
and a customer. That is the failure mode this service exists to avoid.

## If a document is wrong

```
POST https://decoindex.com/feedback
{"url": "<the decoindex URL>", "kind": "wrong_data", "message": "what you expected"}
```

No authentication. `kind`: `wrong_data`, `missing`, `broken`, `unsupported`,
`other`. This is the only way we find out.
