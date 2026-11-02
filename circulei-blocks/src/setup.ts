/** Site setup: sections + CMS blocks. The Studio admin half is server-only (server/admin-setup.ts). */
import { applySectionConventions } from "@decocms/blocks/cms";
import { createSiteSetup } from "@decocms/blocks/setup";
import { registerCachePattern } from "@decocms/blocks/sdk/cacheHeaders";
import { blocks as generatedBlocks } from "../.deco/blocks.gen";
import { sectionMeta, syncComponents, loadingFallbacks } from "../.deco/sections.gen";

const sectionGlob = import.meta.glob("./sections/**/*.tsx") as Record<string, () => Promise<any>>;

// Every page depends on the visitor's city (Cloudflare geo, or the `cidade` cookie): nothing is
// shared at the edge, same as the plain Worker.
registerCachePattern({ test: () => true, profile: "private" });

createSiteSetup({
  sections: sectionGlob,
  blocks: generatedBlocks,
  productionOrigins: ["https://circulei.decoindex.com"],
  onResolveError: (error, resolveType, context) => console.error(`[cms] ${context} "${resolveType}" failed:`, error),
});

applySectionConventions({ meta: sectionMeta, syncComponents, loadingFallbacks, sectionGlob });
