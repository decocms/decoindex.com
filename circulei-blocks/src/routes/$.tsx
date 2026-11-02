import { createFileRoute, notFound } from "@tanstack/react-router";
import { cmsRouteConfig, CmsPage } from "@decocms/tanstack";
import { Hb, Kick } from "~/components/ui";

const config = cmsRouteConfig({ siteName: "Circulei", defaultTitle: "Circulei" });

export const Route = createFileRoute("/$")({
  ...config,
  // A thrown notFound() gives a real 404 status instead of a 200 "not found" page.
  loader: async (ctx: Parameters<typeof config.loader>[0]) => {
    const page = await config.loader(ctx);
    if (!page) throw notFound();
    return page;
  },
  component: Page,
  notFoundComponent: () => (
    <main className="wrap nf">
      <Kick>404</Kick>
      <Hb as="h1" dim="Ela pode ter sido alugada ou saído do acervo.">
        Essa peça já circulou.
      </Hb>
      <a className="btn dark" href="/">
        Ver o que está perto de você
      </a>
    </main>
  ),
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
