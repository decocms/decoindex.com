import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { cmsHomeRouteConfig } from "@decocms/tanstack";
import { HomePage } from "~/components/HomePage";
import { thumb } from "~/components/Product";

/**
 * The home, and every chat turn's URL. `/c/{id}` is rewritten to `/?c={id}` (router.tsx), so a
 * finished turn changing the address bar stays on this route: a separate /c/$id route remounted the
 * chat (blink, every tile animating in again). With `c`, <head> carries that turn's title and photo,
 * so a pasted link previews what it shows; the chat section reopens the turn from KV.
 */
const getShare = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => (await import("~/server/share.server")).readShare(data));

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
    if (!s) return config.head({ loaderData: loaderData?.page as never });
    const title = `“${s.q}” — deco shop`;
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
