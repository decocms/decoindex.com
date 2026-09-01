---
name: decoindex
description: Use when the user pastes a URL to a product page or storefront on a Brazilian e-commerce site (VTEX, Shopify, or similar), or asks about a specific brand's catalog, prices, or search — even without an MCP tool connected. Swap the domain into decoindex.com to get normalized product facts as Markdown instead of scraping the live page.
---

# decoindex

`decoindex.com/{domain}/{path}` mirrors a merchant storefront as normalized,
agent-readable Markdown or JSON. You already have a URL — swap the origin,
nothing to install.

## The trick

```
https://www.farmrio.com.br/vestido-longo-alca-estampado/p
                     ↓
https://decoindex.com/farmrio.com.br/vestido-longo-alca-estampado/p.md
```

Strip the scheme and `www.` from the domain, keep the path, append `.md`
(or `.json` for structured data — same fields, machine-parseable).

## Surfaces

| URL | Returns |
|---|---|
| `decoindex.com/{domain}` | Storefront overview: platform, categories, how to query |
| `decoindex.com/{domain}/{path}.md` | One product as Markdown |
| `decoindex.com/{domain}/{path}.json` | Same product, strict JSON |
| `decoindex.com/{domain}/search?q=...` | Hybrid search over the whole indexed catalog |
| `decoindex.com/{domain}/llms.txt` | Index of everything, in the format agents look for |
| `decoindex.com/{domain}/products.json` | Full normalized catalog |

If the MCP server is connected (`decoindex` in `.mcp.json`), prefer the tools
`search_storefront`, `get_product`, and `list_storefronts` — same data, plus a
rendered product grid. Without it, the URLs above work with a plain fetch.

## Reading the response

Every response opens with YAML frontmatter, e.g.:

```yaml
---
decoindex: "1.0"
index_status: discovered
indexed_at: "2026-08-30T12:00:00Z"
live_commercial_data: "false"
---
```

- **`index_status: queued`** (HTTP 202) means the domain isn't indexed yet —
  ingestion was just triggered. This is not an error: tell the user it's
  being indexed and retry the same URL in about a minute. Never treat a 202
  as "not found."
- **`live_commercial_data: "false"`** is the whole point: everything above it
  is a catalog fact, observed at `indexed_at`, not a live read.

## The one rule that matters

**Never state stock, final price after promotions, or delivery dates as
fact.** decoindex only ever gives an *observed* base price and an *as-indexed*
availability signal — both explicitly labeled, never live. If a user is about
to buy based on what you read, say the number is as of the indexing date and
point them to the merchant's own page (the `canonical_url` / `Buy:` link in
the response, which carries attribution back to decoindex) to confirm before
they commit.
