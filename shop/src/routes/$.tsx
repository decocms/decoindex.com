import { createFileRoute, notFound } from "@tanstack/react-router";
import { cmsRouteConfig, CmsPage } from "@decocms/tanstack";
import { Lost } from "~/components/NotFound";

const config = cmsRouteConfig({ siteName: "deco shop", defaultTitle: "deco shop" });

export const Route = createFileRoute("/$")({
  ...config,
  // A thrown notFound() gives a real 404 status instead of a 200 "not found" page.
  loader: async (ctx: Parameters<typeof config.loader>[0]) => {
    const page = await config.loader(ctx);
    if (!page) throw notFound();
    return page;
  },
  component: Page,
  notFoundComponent: () => <Lost />,
});

function Page() {
  const data = Route.useLoaderData() as Record<string, any>;
  return (
    <CmsPage
      sections={data.resolvedSections ?? []}
      deferredSections={data.deferredSections ?? []}
      pagePath={data.pagePath}
      pageUrl={data.pageUrl}
      device={data.device}
    />
  );
}
