import { createFileRoute } from "@tanstack/react-router";
import { cmsHomeRouteConfig, CmsPage } from "@decocms/tanstack";

const config = cmsHomeRouteConfig({ defaultTitle: "deco shop", siteName: "deco shop", pendingMs: 60_000, pendingMinMs: 0 });

export const Route = createFileRoute("/")({
  ...config,
  component: Home,
});

function Home() {
  const data = Route.useLoaderData() as Record<string, any> | null;
  if (!data) return <p className="p-10 text-center">Nenhuma página no CMS para "/".</p>;
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
