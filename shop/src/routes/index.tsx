import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { cmsHomeRouteConfig } from "@decocms/tanstack";
import { HomePage } from "~/components/HomePage";
import { thumb } from "~/components/Product";
import { splitDetails } from "~/details";

/**
 * The home, and every chat turn's URL. `/c/{id}` is rewritten to `/?c={id}` (router.tsx), so a
 * finished turn changing the address bar stays on this route: a separate /c/$id route remounted the
 * chat (blink, every tile animating in again). With `c`, <head> carries that turn's title and photo,
 * so a pasted link previews what it shows; the chat section reopens the turn from KV.
 */
const getShare = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => (await import("~/server/share.server")).readShare(data));

/** Who we are and how to search us, for search engines: a WebSite with its search, by deco. */
const LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://shop.decoindex.com/#website",
      url: "https://shop.decoindex.com/",
      name: "deco shop",
      inLanguage: "pt-BR",
      description: "Converse para comprar nas marcas brasileiras de moda: FARM, Animale, Osklen, Reserva e mais, num chat só.",
      publisher: { "@id": "https://decocms.com/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: "https://shop.decoindex.com/?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": "https://decocms.com/#organization",
      name: "deco",
      url: "https://decocms.com",
      logo: "https://shop.decoindex.com/deco-logo.png",
    },
  ],
};

const config = cmsHomeRouteConfig({ defaultTitle: "deco shop", siteName: "deco shop", pendingMs: 60_000, pendingMinMs: 0 });

export const Route = createFileRoute("/")({
  ...config,
  loaderDeps: ({ search }: { search: Record<string, unknown> }) => ({ c: typeof search.c === "string" ? search.c : undefined }),
  loader: async ({ deps }) => {
    const [page, share] = await Promise.all([config.loader(), deps.c ? getShare({ data: deps.c }) : null]);
    return { page, share };
  },
  headers: (ctx: { loaderData?: { page?: unknown } }) => config.headers({ loaderData: ctx.loaderData?.page as never }),
  head: ({ loaderData }) => {
    const s = loaderData?.share;
    if (!s) {
      const base = config.head({ loaderData: loaderData?.page as never });
      return { ...base, scripts: [...((base as { scripts?: object[] }).scripts ?? []), { type: "application/ld+json", children: JSON.stringify(LD) }] };
    }
    const title = `“${splitDetails(s.q).q}” — deco shop`;
    const description = s.answer || `${s.tiles.length} achados no deco shop.`;
    const image = s.tiles[0]?.images[0];
    return {
      meta: [
        { title },
        { name: "description", content: description },
        // A conversation is for people, not search engines.
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(image
          ? [
              { property: "og:image", content: thumb(image, 800) },
              { name: "twitter:image", content: thumb(image, 800) },
            ]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: () => <HomePage data={Route.useLoaderData().page as Record<string, any> | null} />,
});
