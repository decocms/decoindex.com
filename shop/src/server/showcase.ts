import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import type { Tile } from "../types";
import { BRANDS, type Segment } from "./brands";
import { findProducts, type Sort } from "./find";
import { TYPE_NAMES, type ProductType } from "./taxonomy";

/**
 * Real product photos for the home's cards, ideas and shelves. The CMS says
 * *what* (a type, a store, a sort); this resolves it through the same category
 * heuristics the chat uses. Cached in KV for an hour per spec, so the home
 * costs decoindex a handful of reads an hour, not per visit.
 */
export interface ShowcaseSpec {
  dept: "feminino" | "masculino";
  cards: { type: ProductType }[];
  ideas: { type?: ProductType; terms?: string }[];
  shelves: { domain: string; type?: ProductType; terms?: string; sort?: Sort }[];
}

export interface ShowcaseData {
  cards: Tile[][];
  ideas: (Tile | null)[];
  shelves: Tile[][];
}

const TTL = 60 * 60;
// One shared caller key: showcase reads are few and cached, and must not eat a shopper's per-IP budget.
const IP = "decoshop-showcase";

function deptBrands(dept: ShowcaseSpec["dept"], type: ProductType) {
  const neutral: Segment[] = ["esporte", "calcados", "bolsas", "praia"];
  return BRANDS.filter((b) => b.segments.includes(dept) || b.segments.some((s) => neutral.includes(s)))
    .filter((b) => !(type === "tenis" && !b.segments.includes("calcados")));
}

/** A few stores that carry `type` for this department, read via their category pages, interleaved. */
async function sample(spec: ShowcaseSpec, type: ProductType, terms: string | undefined, n: number): Promise<Tile[]> {
  // Prefer stores with a real category for the type; fall back to their search
  // (no store has a "biquíni" category, but several sell biquínis).
  const out: Tile[][] = [];
  const searched: Tile[][] = [];
  for (const b of deptBrands(spec.dept, type)) {
    if (out.length >= 3 || out.length + searched.length >= 4) break;
    const f = await findProducts({ env, ip: IP, dept: spec.dept }, { domain: b.domain, type, terms });
    const withImg = f.tiles.filter((t) => t.images[0]);
    if (!withImg.length) continue;
    (f.via.includes("›") ? out : searched).push(withImg);
  }
  out.push(...searched.slice(0, Math.max(0, 3 - out.length)));
  const mixed: Tile[] = [];
  for (let i = 0; mixed.length < n && i < 24; i++) for (const l of out) if (l[i] && mixed.length < n) mixed.push(l[i]);
  return mixed;
}

function valid(spec: ShowcaseSpec): ShowcaseSpec {
  const isType = (t: unknown): t is ProductType => TYPE_NAMES.includes(t as ProductType);
  return {
    dept: spec.dept === "masculino" ? "masculino" : "feminino",
    cards: (spec.cards ?? []).filter((c) => isType(c.type)).slice(0, 10),
    ideas: (spec.ideas ?? []).slice(0, 6).map((i) => ({ type: isType(i.type) ? i.type : undefined, terms: i.terms?.slice(0, 40) })),
    shelves: (spec.shelves ?? [])
      .filter((s) => BRANDS.some((b) => b.domain === s.domain))
      .slice(0, 4)
      .map((s) => ({ domain: s.domain, type: isType(s.type) ? s.type : undefined, terms: s.terms?.slice(0, 40), sort: s.sort })),
  };
}

export const getShowcase = createServerFn({ method: "POST" })
  .inputValidator((spec: ShowcaseSpec) => valid(spec))
  .handler(async ({ data: spec }): Promise<ShowcaseData> => {
    const key = `showcase:${await digest(JSON.stringify(spec))}`;
    const hit = await env.SHARES?.get(key);
    if (hit) return JSON.parse(hit) as ShowcaseData;

    const [cards, ideas, shelves] = await Promise.all([
      Promise.all(spec.cards.map((c) => sample(spec, c.type, undefined, 3))),
      Promise.all(spec.ideas.map(async (i) => (i.type ? (await sample(spec, i.type, i.terms, 1))[0] ?? null : null))),
      Promise.all(
        spec.shelves.map(async (s) =>
          (await findProducts({ env, ip: IP, dept: spec.dept }, { domain: s.domain, type: s.type, terms: s.terms, sort: s.sort })).tiles
            .filter((t) => t.images[0])
            .slice(0, 12),
        ),
      ),
    ]);
    const data: ShowcaseData = { cards, ideas, shelves };
    // Only cache a complete-looking answer, so a cold or rate-limited read doesn't stick for an hour.
    if (env.SHARES && cards.every((c) => c.length) && shelves.every((s) => s.length)) {
      await env.SHARES.put(key, JSON.stringify(data), { expirationTtl: TTL });
    }
    return data;
  });

async function digest(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
