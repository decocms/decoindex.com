import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { DecoRootLayout } from "@decocms/tanstack";
// @ts-ignore Vite ?url import
import appCss from "../styles/app.css?url";

const TITLE = "deco shop — moda brasileira num chat só";
const DESCRIPTION = "Converse para comprar nas marcas brasileiras que você ama: FARM, Animale, Osklen, Reserva, FILA, New Balance e mais, num lugar só.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: "#ffffff" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "deco shop" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [
      { rel: "preconnect", href: "https://api.fontshare.com" },
      { rel: "stylesheet", href: "https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='%230a0a0a'/><text x='16' y='22' font-size='18' text-anchor='middle' fill='%23d9f99d' font-family='serif'>d</text></svg>" },
    ],
  }),
  component: () => (
    // DecoRootLayout renders the route outlet itself; children are extras after it.
    <DecoRootLayout siteName="decoshop" lang="pt-BR" bodyClassName="bg-paper text-ink antialiased" />
  ),
});
