/**
 * Studio admin protocol (schema, preview shell). Server-only, imported by worker-entry: in the
 * shared setup.ts its stylesheet URL reached the browser bundle and loaded as a second,
 * render-blocking copy of the CSS the page already inlines.
 */
import { createAdminSetup } from "@decocms/blocks-admin/setup";
import { PreviewProviders } from "@decocms/tanstack";
// A data: URL, not `?url`: a `?url` import emits an asset that TanStack lists in the page manifest,
// and the browser then fetched it on every page (404: it only exists in the server build).
// @ts-ignore Vite ?inline import
import appCss from "../styles/app.css?inline";

createAdminSetup({
  meta: () => import("../../.deco/meta.gen.json").then((m) => m.default),
  css: `data:text/css,${encodeURIComponent(appCss)}`,
  fonts: [],
  previewWrapper: PreviewProviders,
});
