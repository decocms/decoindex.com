/** Site setup: sections + CMS blocks + Studio admin. No commerce app — the catalog is decoindex. */
import { applySectionConventions } from "@decocms/blocks/cms";
import { createSiteSetup } from "@decocms/blocks/setup";
import { createAdminSetup } from "@decocms/blocks-admin/setup";
import { PreviewProviders } from "@decocms/tanstack";
import { blocks as generatedBlocks } from "../.deco/blocks.gen";
import { sectionMeta, syncComponents, loadingFallbacks } from "../.deco/sections.gen";
// @ts-ignore Vite ?url import
import appCss from "./styles/app.css?url";

const sectionGlob = import.meta.glob("./sections/**/*.tsx") as Record<string, () => Promise<any>>;

createSiteSetup({
  sections: sectionGlob,
  blocks: generatedBlocks,
  productionOrigins: ["https://shop.decoindex.com"],
  onResolveError: (error, resolveType, context) => console.error(`[cms] ${context} "${resolveType}" failed:`, error),
});

createAdminSetup({
  meta: () => import("../.deco/meta.gen.json").then((m) => m.default),
  css: appCss,
  fonts: [],
  previewWrapper: PreviewProviders,
});

applySectionConventions({ meta: sectionMeta, syncComponents, loadingFallbacks, sectionGlob });
