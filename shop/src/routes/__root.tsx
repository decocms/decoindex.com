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
      // 1200×630 card, rendered from design/og.html (≈75KB: WhatsApp drops previews much over 300KB).
      { property: "og:image", content: "https://shop.decoindex.com/og.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "deco shop — todas as marcas brasileiras que você ama, num chat só" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://shop.decoindex.com/og.jpg" },
    ],
    links: [
      { rel: "preconnect", href: "https://api.fontshare.com" },
      { rel: "stylesheet", href: "https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap" },
      { rel: "stylesheet", href: appCss },
      // Same mark as demo-storefront.
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "shortcut icon", href: "/favicon.ico" },
    ],
  }),
  component: () => (
    // DecoRootLayout renders the route outlet itself; children are extras after it.
    <DecoRootLayout siteName="decoshop" lang="pt-BR" bodyClassName="bg-paper text-ink antialiased" />
  ),
});
