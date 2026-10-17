import { createFileRoute } from "@tanstack/react-router";
import { cmsHomeRouteConfig } from "@decocms/tanstack";
import { HomePage } from "~/components/HomePage";

const config = cmsHomeRouteConfig({ defaultTitle: "deco shop", siteName: "deco shop", pendingMs: 60_000, pendingMinMs: 0 });

export const Route = createFileRoute("/")({
  ...config,
  component: () => <HomePage data={Route.useLoaderData() as Record<string, any> | null} />,
});
