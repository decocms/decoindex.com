import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { cmsHomeRouteConfig } from "@decocms/tanstack";
import { HomePage } from "~/components/HomePage";
import { thumb } from "~/components/Product";

/**
 * `/c/{id}`: a chat turn's own URL, like daydream's `/c/{uuid}`. It is the home page; the chat
 * section reads the id from the path and reopens that frozen turn from KV (no new search). The
 * server only adds the turn's title and photo to <head>, so a pasted link previews what it shows.
 */
const getShare = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => (await import("~/server/share.server")).readShare(data));

const config = cmsHomeRouteConfig({ defaultTitle: "deco shop", siteName: "deco shop", pendingMs: 60_000, pendingMinMs: 0 });

export const Route = createFileRoute("/c/$id")({
  ...config,
  loader: async ({ params }) => {
    const [page, share] = await Promise.all([config.loader(), getShare({ data: params.id })]);
    return { page, share };
  },
  headers: () => ({}),
  head: ({ loaderData }) => {
    const s = loaderData?.share;
    if (!s) return { meta: [{ title: "deco shop" }, { name: "robots", content: "noindex" }] };
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
