import { CmsPage } from "@decocms/tanstack";
import { useBus } from "~/sdk/bus";
import { Footer } from "./Footer";

/** The CMS home ("/"), shared by `/` and `/c/$id` (a chat reopened from its snapshot). */
export function HomePage({ data }: { data: Record<string, any> | null | undefined }) {
  const { started } = useBus();
  if (!data) return <p className="p-10 text-center">Nenhuma página no CMS para "/".</p>;
  return (
    <>
      <CmsPage
        sections={data.resolvedSections ?? []}
        deferredSections={data.deferredSections ?? []}
        pagePath={data.pagePath}
        pageUrl={data.pageUrl}
        device={data.device}
      />
      {/* The home only: inside a conversation the composer is pinned to the bottom on phones. */}
      {!started && <Footer />}
    </>
  );
}
