import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { DecoRootLayout } from "@decocms/tanstack";
// Inlined: one less render-blocking request (the plain Worker inlines it too).
// @ts-ignore Vite ?inline import
import appCss from "../styles/app.css?inline";

// Self-hosted Archivo (OFL), kept out of app.css: Vite rewrites url() inside ?inline CSS and the
// SSR build chokes on a public-dir path there.
const FONT = '@font-face{font-family:Archivo;font-style:normal;font-weight:300 900;font-stretch:62% 125%;font-display:swap;src:url(/fonts/archivo-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}';

const TITLE = "Circulei · Alugue roupas incríveis perto de você";
const DESCRIPTION = "Peças de closets de mulheres de 40 cidades, pra alugar por 4 dias. A dona ganha a cada aluguel.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      // A proposal, not Circulei's production site.
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#ffffff" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: [
      { rel: "preload", href: "/fonts/archivo-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://cdn.shopify.com", crossOrigin: "anonymous" },
      {
        rel: "icon",
        href: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#000"/><rect x="11" y="11" width="10" height="10" fill="#e0560e"/></svg>')}`,
      },
    ],
    styles: [{ children: FONT + appCss }],
  }),
  component: () => <DecoRootLayout siteName="circulei" lang="pt-BR" />,
});
