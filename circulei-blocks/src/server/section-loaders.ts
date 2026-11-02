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
  "site/sections/Hero.tsx": async (props, req) => ({ ...props, ...v.hero(await v.ctxFor(req), (props.featured as string[] | undefined) ?? []) }),
  // The filters live in the URL (?tam=36,38&alt=b): the server renders the filtered grid, so coming
  // back from a piece shows the same list at the same scroll, before hydration.
  "site/sections/NearGrid.tsx": async (props, req) => {
    const u = new URL(req.url);
    const list = (k: string) => (u.searchParams.get(k) ?? "").split(",").filter((x) => /^[\w]{1,3}$/.test(x));
    // `mais`: how many were open, so back from a piece shows the same rows.
    const shown = Math.min(240, Number(u.searchParams.get("mais")) || 0);
    return { ...props, ...v.near(await v.ctxFor(req)), selected: { sizes: list("tam"), heights: list("alt") }, shown };
  },
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
