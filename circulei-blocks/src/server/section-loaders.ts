/**
 * Server-only (imported by worker-entry, never by the client): each section gets just what it
 * renders, from one Ctx per request (the visitor's city and the KV snapshot).
 */
import { registerSectionLoaders } from "@decocms/blocks/cms";
import type { Ctx } from "../../../circulei/src/html";
import * as v from "./view.server";

const add =
  (data: (c: Ctx) => Record<string, unknown>) =>
  async (props: Record<string, unknown>, req: Request) => ({ ...props, ...data(await v.ctxFor(req)) });

registerSectionLoaders({
  "site/sections/Header.tsx": add((c) => ({ place: v.place(c), hubs: v.hubs(c) })),
  "site/sections/Hero.tsx": add(v.hero),
  "site/sections/NearGrid.tsx": add(v.near),
  "site/sections/AwayRail.tsx": add(v.rail),
  "site/sections/LenderBand.tsx": add((c) => ({ ratio: c.snap.rentRatio })),
  "site/sections/Yield.tsx": add((c) => ({ ratio: c.snap.rentRatio })),
  "site/sections/ExploreCities.tsx": add((c) => ({ hubs: v.hubs(c, true), cities: c.snap.cities.length, total: c.snap.pieces.length })),
  "site/sections/LenderHero.tsx": add((c) => {
    const s = v.lenderStats(c);
    return { stats: { owners: s.owners, cities: s.cities, pieces: s.pieces }, cover: s.cover };
  }),
  "site/sections/Brands.tsx": add((c) => ({ brands: v.lenderStats(c).brands })),
});
