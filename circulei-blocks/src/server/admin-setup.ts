/**
 * Studio admin protocol (schema, preview shell). Server-only, imported by worker-entry: in the
 * shared setup.ts its stylesheet URL reached the browser bundle and loaded as a second,
 * render-blocking copy of the CSS the page already inlines.
 */
import { createAdminSetup } from "@decocms/blocks-admin/setup";
import { PreviewProviders } from "@decocms/tanstack";
// @ts-ignore Vite ?url import
import appCss from "../styles/app.css?url";

createAdminSetup({
  meta: () => import("../../.deco/meta.gen.json").then((m) => m.default),
  css: appCss,
  fonts: [],
  previewWrapper: PreviewProviders,
});
