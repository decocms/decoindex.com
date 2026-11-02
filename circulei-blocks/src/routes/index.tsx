import { createFileRoute } from "@tanstack/react-router";
import { cmsHomeRouteConfig, CmsPage } from "@decocms/tanstack";

const config = cmsHomeRouteConfig({ defaultTitle: "Circulei", siteName: "Circulei", pendingMs: 60_000, pendingMinMs: 0 });

export const Route = createFileRoute("/")({
  ...config,
  component: Home,
});

function Home() {
  const data = Route.useLoaderData() as Record<string, any> | null;
  return (
    <CmsPage
      sections={data?.resolvedSections ?? []}
      deferredSections={data?.deferredSections ?? []}
      pagePath={data?.pagePath}
      pageUrl={data?.pageUrl}
      device={data?.device}
    />
  );
}
