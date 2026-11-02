# circulei-blocks: circulei/ on TanStack Start + deco blocks

The same storefront as `circulei/` (read that AGENTS.md first), rebuilt the way deco sites are
built, so Circulei can edit it in deco Studio. **This is circulei.decoindex.com** since Nov 1 2026.
The plain Worker (`circulei/`) still runs the hourly catalog cron and stays up for comparison at
https://decoindex-circulei.deco-ceo.workers.dev.

Not on Workers Builds: `npm run build && npx wrangler deploy` from this folder.

## What is shared and what is not

- **Shared, imported from `../circulei/src`:** catalog snapshot, hubs, geo, Jev search, labels,
  the deck, the APIs and the CSS (copied once into `src/styles/app.css`). Both versions show the
  same pieces in the same order. The hourly cron stays on `circulei/`: one rebuild for both.
- **Here:** React components and CMS pages.
  - `.deco/blocks/pages-*.json` hold every text (headline, occasions, steps, yield table, footer).
  - Sections take two kinds of props: editable CMS props, and `@hide` props filled per request by
    `src/server/section-loaders.ts` (the visitor's city, cards, hubs), only what each one renders.
  - The PDP (`routes/p/$handle.tsx`) is a code route: everything on it is the piece's own data.
- **`worker-entry.ts`** fronts the deco worker:
  - `/api/busca?format=json` (cards for the React grid).
  - `circulei/` for the other APIs and `/deck`.
  - The `?cidade=` cookie.

## Performance choices (each one measured)

| Change | Why |
|---|---|
| Every page uses the `private` cache profile | Content depends on geo and the city cookie; nothing is shared at the edge (same as `circulei/`) |
| CSS inlined (`?inline`), `@font-face` inline in `__root.tsx` | No render-blocking stylesheet. Vite chokes on `url()` inside `?inline` CSS in the SSR build, hence the separate string |
| Archivo self-hosted (`public/fonts`) | Google Fonts blocked first paint about 2s on 4G |
| Admin setup in `server/admin-setup.ts`, not `setup.ts` | In the shared setup its `app.css?url` reached the client bundle and loaded a second, blocking CSS |
| `modulepreload` links removed (HTMLRewriter) | They pulled 200 KB of JS at high priority, competing with the hero photo |
| Hydration on window `load`, then idle | Same reason. The page is server HTML and works before hydration |

## Benchmark (Nov 1 2026, workers.dev, `bench/`)

Lighthouse mobile, median of 3 runs, real throttling (`METHOD=devtools`):

| page | Worker (`circulei/`) | TanStack + blocks |
|---|---|---|
| home | 77 · FCP 0.87s · LCP 6.78s | 77 · FCP 0.85s · LCP 6.67s |
| locadora | 93 · FCP 0.81s · LCP 3.25s | 93 · FCP 0.78s · LCP 3.20s |
| PDP | 68 · FCP 0.79s · LCP 10.07s | 68 · FCP 0.81s · LCP 9.98s |

**Simulated throttling** (Lighthouse default) is noisier for this setup. It scores the TanStack
home and locadora lower on some runs (87 vs 95), and the PDP higher (95 vs 88).

**Costs:**
- JS: 0 KB vs about 200 KB gzip.
- Server TTFB p50: about 55 vs about 77 ms on the home, because of SSR and serialization.

The LCP on both is the photos: Shopify serves the hero at 800 to 900 px. That is the next win,
for both versions.
