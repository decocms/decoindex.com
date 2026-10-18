import { env, waitUntil } from "cloudflare:workers";
import type { Tile } from "../types";
import { BRANDS, type Segment } from "./brands";
import { categories, newHealth } from "./catalog";
import { findProducts } from "./find";
import { TYPES, TYPE_NAMES, colorConflict, colorsIn, deptOf, detectType, overlap, pickCategory, words, type ProductType, FAMILY } from "./taxonomy";

/**
 * Real product photos for the home's cards and ideas — a daily index,
 * never computed on a visitor's request once it exists.
 *
 *   visit   → read the snapshot from KV and return it, always;
 *             older than a day → also rebuild it in the background (SWR, locked)
 *   cron    → 09:00 UTC (06:00 BRT) rebuilds every spec ever requested, so the
 *             home changes once a day even with no traffic, and no visitor pays
 *   rebuild → only replaces the snapshot when the new one is complete, or the
 *             old one wasn't: a store being down never makes the home worse
 *
 * The CMS says *what* (a type, a store, a sort); this resolves it through the
 * same category heuristics the chat uses. Which stores and which pieces are
 * shown rotate with the day, so the cards actually change daily.
 */
export interface ShowcaseSpec {
  dept: "feminino" | "masculino";
  cards: { type: ProductType; terms?: string }[];
  ideas: { type?: ProductType; terms?: string }[];
}

export interface ShowcaseData {
  cards: Tile[][];
  ideas: (Tile | null)[];
}

interface Snapshot {
  data: ShowcaseData;
  builtAt: number;
  complete: boolean;
}

const DAY = 86_400_000;
const SNAPSHOT = (h: string) => `showcase:v16:${h}`; // v16: category grid with jewelry/lingerie, editorial photos
const SPEC = (h: string) => `showcase-spec:${h}`;
const LOCK = (h: string) => `showcase-lock:${h}`;
// One shared caller key: showcase reads are few and must not eat a shopper's per-IP budget.
const IP = "decoshop-showcase";
/**
 * Most stores one card/idea may try, and its own read budget. Per item, not one
 * shared pool: items run in parallel and a shared budget let the first cards
 * starve the ideas (empty photos). Builds are offline (cron/SWR), so ~20 items ×
 * 12 reads a day is fine — and still bounded.
 */
const MAX_TRIES = 6;
const ITEM_BUDGET = 12;
/** Stores whose category tree we consult per item. Trees are memoized per isolate, so mostly free after the first item. */
const TREE_PROBES = 24;

const SHOES: ProductType[] = ["tenis", "sandalia", "chinelo", "sapato"];
const BAGS: ProductType[] = ["bolsa", "mochila", "mala"];

/**
 * Brands that sell `type` to this department. A brand needs the department
 * itself; shoe and bag brands also count for shoes and bags. ("Neutral"
 * segments like praia let FARM into masculino.)
 */
function deptBrands(dept: ShowcaseSpec["dept"], type: ProductType, day: number, item: number) {
  const has = (b: (typeof BRANDS)[number], seg: Segment) => b.segments.includes(seg);
  const list = BRANDS.filter((b) => {
    // Shoes/bags still need the department (Capodarte is women's shoes) — sports brands sell to both.
    if (SHOES.includes(type)) return (has(b, "calcados") || has(b, "esporte")) && (has(b, dept) || has(b, "esporte"));
    if (BAGS.includes(type)) return has(b, dept) && (has(b, "bolsas") || type !== "mala");
    // Jewelers sell to everyone and carry no department of their own; lingerie brands mostly to women.
    if (type === "joia") return has(b, "joias");
    if (type === "lingerie") return has(b, "lingerie") && (has(b, dept) || dept === "feminino");
    return has(b, dept);
  });
  // Rotate by day *and* by item: a different first store per day, and different
  // cards start at different stores (one shared start made one brand own the page).
  const k = list.length ? (day + item * 7) % list.length : 0;
  return [...list.slice(k), ...list.slice(0, k)];
}

/** A few stores that carry `type` for this department, read via their category pages, interleaved. */
/**
 * How good a tile is as *the* photo for a card or idea:
 *   2 — the title starts with the type ("Mala…", not "Tag de mala…") and has the terms
 *   1 — it is that type and has the terms
 *   0 — anything else
 */
/** Types that are the same thing for a photo: a "calcinha de biquíni" in a swimwear category is fine. */
const sameFamily = (a: ProductType, b: ProductType) => a === b || FAMILY.some((f) => f.includes(a) && f.includes(b));

const UNDERWEAR = new Set(["calcinha", "sutia", "cueca", "lingerie"]);

function heroScore(t: Tile, type: ProductType, want: string[], beachBrand = false): number {
  const ws = words(t.title);
  // Multi-packs are never a hero ("Kit 10 Calcinhas…"); underwear words only pass as swimwear from a beachwear brand.
  if (ws[0] === "kit") return 0;
  // The first word names the piece: "Calça Moletom" is trousers, not a sweatshirt.
  const firstType = ws[0] ? detectType(ws[0]) : undefined;
  if (firstType && !sameFamily(firstType, type)) return 0;
  if (ws.some((w) => UNDERWEAR.has(w)) && sameFamily(type, "biquini") && !beachBrand) return 0;
  // The store's category is the stronger signal: "Calcinha Biquíni" filed under lingerie is not swimwear.
  const catType = t.category ? detectType(t.category) : undefined;
  if (catType && !sameFamily(catType, type)) return 0;
  const first = words(t.title)[0] ?? "";
  const hasTerms = !want.length || overlap(want, `${t.title} ${t.description ?? ""} ${t.colors?.join(" ") ?? ""}`) > 0;
  if (!hasTerms) return 0;
  // A color in the idea is a promise the photo must keep: "camisa de linho branca" showed a black one,
  // because "linho" alone matched. Here unknown color doesn't pass either: a hero photo must be sure.
  if (colorsIn(want.join(" ")).length && (colorConflict(want, t) || !colorsIn(`${t.title} ${t.colors?.join(" ") ?? ""}`).length)) return 0;
  const syn = TYPES[type] as readonly string[];
  if (syn.includes(first)) return 2;
  // Any word, not "first type word wins": "Top Biquíni Lenny" is a bikini.
  return words(`${t.title} ${t.category ?? ""}`).some((w) => syn.includes(w)) ? 1 : 0;
}

/**
 * One card's photos, kept a day per (department, type, terms). decoindex allows the showcase 20 cold
 * reads a minute, so one build of ~45 cards gets most of them refused and they came back empty
 * (Biquínis, Tricô, Verde). With this, each build only reads the cards still missing, and an
 * incomplete page fills in over the next rebuilds instead of starting over.
 */
const ITEM = (dept: string, type: string, terms: string | undefined, n: number, day: number) => `showcase-item:v1:${dept}:${type}:${terms ?? ""}:${n}:${day}`;

async function sample(
  spec: ShowcaseSpec,
  type: ProductType,
  terms: string | undefined,
  n: number,
  day: number,
  item: number,
  taken: Set<string>,
): Promise<Tile[]> {
  const key = ITEM(spec.dept, type, terms, n, day);
  const hit = await env.SHARES?.get(key).catch(() => null);
  if (hit) {
    const tiles = (JSON.parse(hit) as Tile[]).filter((t) => !taken.has(t.id));
    if (tiles.length) {
      for (const t of tiles) taken.add(t.id);
      return tiles;
    }
  }
  const tiles = await sampleLive(spec, type, terms, n, day, item, taken);
  if (tiles.length) await env.SHARES?.put(key, JSON.stringify(tiles), { expirationTtl: 2 * 86_400 }).catch(() => {});
  return tiles;
}

async function sampleLive(
  spec: ShowcaseSpec,
  type: ProductType,
  terms: string | undefined,
  n: number,
  day: number,
  item: number,
  taken: Set<string>, // photos already used elsewhere on the page: each piece appears once
) {
  const health = newHealth(); // own budget, see ITEM_BUDGET
  const want = terms ? words(terms) : [];
  // Stores that actually have a category for this type go first: rotating
  // blindly made "saia" try six stores that sell no skirts and come out empty.
  // Tree reads don't count against the item budget (memoized, cached upstream).
  const rotated = deptBrands(spec.dept, type, day, item);
  // Shoes and bags are genuinely unisex; for clothing, a store selling to both sides must prove the department.
  const unisexType = SHOES.includes(type) || BAGS.includes(type);
  const isMixed = (b: (typeof rotated)[number]) => !unisexType && b.segments.includes("feminino") && b.segments.includes("masculino");
  const trees = newHealth();
  const carry: typeof rotated = [];
  for (const b of rotated.slice(0, TREE_PROBES)) {
    // A sibling category counts: beachwear stores file bikinis under "Moda Praia", not "Biquíni".
    const cats = await categories(env, b.domain, IP, trees);
    const family = FAMILY.find((f) => f.includes(type)) ?? [type];
    const pick = [type, ...family.filter((f) => f !== type)].map((ft) => pickCategory(cats, ft, { dept: spec.dept })).find(Boolean);
    if (!pick) continue;
    // A brand that sells to both sides only leads if its category says the department
    // (Handred's "Calças" is mixed: a woman's jumpsuit fronted masculino Calças).
    if (isMixed(b) && deptOf(pick.category.words.join(" ")) !== spec.dept) continue;
    carry.push(b);
  }
  // For fashion types, sports and shoe brands are a fallback, not the lead (ASICS and Havaianas fronting "Calças").
  // Same for lingerie brands outside lingerie: their "biquíni" is a panty cut, not swimwear.
  const sporty = (b: (typeof rotated)[number]) =>
    (!SHOES.includes(type) && (b.segments.includes("esporte") || b.segments.includes("calcados"))) ||
    (type !== "lingerie" && b.segments.includes("lingerie"));
  // Mixed-department brands that didn't qualify above can't be trusted for a hero photo at all.
  const all = [...carry, ...rotated.filter((b) => !carry.includes(b) && !isMixed(b))];
  const ordered = [...all.filter((b) => !sporty(b)), ...all.filter(sporty)];
  // Prefer stores with a real category for the type; fall back to their search
  // (no store has a "biquíni" category, but several sell biquínis). Bounded:
  // with failing reads this once walked all ~57 brands per card (~1,000 reads/visit).
  const out: Tile[][] = [];
  const searched: Tile[][] = [];
  let tries = 0;
  for (const b of ordered) {
    if (out.length >= 3 || out.length + searched.length >= 4) break;
    if (++tries > MAX_TRIES || health.ok + health.failed >= ITEM_BUDGET) break;
    const f = await findProducts({ env, ip: IP, dept: spec.dept, health }, { domain: b.domain, type, terms });
    // Best photos first; a store whose best is score 0 still counts, but sorts last.
    const withImg = f.tiles
      .filter((t) => t.images[0])
      .map((t, i) => ({ t, i, s: heroScore(t, type, want, b.segments.includes("praia")) }))
      .filter((x) => x.s > 0 && !taken.has(x.t.id)) // good candidates not used elsewhere; rotation stays among them
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.t);
    if (!withImg.length) continue;
    (f.via.includes("›") ? out : searched).push(withImg);
  }
  out.push(...searched.slice(0, Math.max(0, 3 - out.length)));
  const mixed: Tile[] = [];
  const seen = new Set<string>();
  const offset = day % 4; // and different pieces within each store
  for (let i = offset; mixed.length < n && i < 24 + offset; i++)
    for (const l of out) {
      const t = l[i % l.length];
      if (t && mixed.length < n && !seen.has(t.id) && !taken.has(t.id)) {
        seen.add(t.id);
        taken.add(t.id);
        mixed.push(t);
      }
    }
  return mixed;
}

async function build(spec: ShowcaseSpec, now = Date.now()): Promise<Snapshot> {
  const day = Math.floor(now / DAY);
  const taken = new Set<string>();
  // Ideas first and sequential: they are the big photos and must be unique; then cards in parallel.
  const ideas: (Tile | null)[] = [];
  for (const [k, i] of spec.ideas.entries()) ideas.push(i.type ? ((await sample(spec, i.type, i.terms, 1, day, k, taken))[0] ?? null) : null);
  const cards = await Promise.all(spec.cards.map((c, k) => sample(spec, c.type, c.terms, 3, day, k + 10, taken)));
  const complete = cards.every((c) => c.length) && ideas.every((t, i) => t || !spec.ideas[i].type);
  return { data: { cards, ideas }, builtAt: now, complete };
}

/** Rebuild and store, unless the new one is worse than what we have. */
async function refresh(spec: ShowcaseSpec, h: string, prev: Snapshot | null): Promise<Snapshot> {
  const next = await build(spec);
  if (!prev || next.complete || !prev.complete) {
    await env.SHARES?.put(SNAPSHOT(h), JSON.stringify(next));
    return next;
  }
  // Keep the good snapshot, but stamp it so we don't retry on every visit.
  const kept = { ...prev, builtAt: Date.now() - DAY + 60 * 60_000 }; // retry in ~1h
  await env.SHARES?.put(SNAPSHOT(h), JSON.stringify(kept));
  return kept;
}

function valid(spec: ShowcaseSpec): ShowcaseSpec {
  const isType = (t: unknown): t is ProductType => TYPE_NAMES.includes(t as ProductType);
  return {
    dept: spec.dept === "masculino" ? "masculino" : "feminino",
    // Three rows: categories, then by material, then by color.
    cards: (spec.cards ?? [])
      .filter((c) => isType(c.type))
      .slice(0, 36) // 12 categories + two carousels of 10, with room
      .map((c) => ({ type: c.type, ...(c.terms ? { terms: c.terms.slice(0, 40) } : {}) })),
    // Up to three blocks of four ideas each ("Buscas em alta", occasions, styles).
    // Three blocks of four ideas plus the three-photo editorial.
    ideas: (spec.ideas ?? []).slice(0, 16).map((i) => ({ type: isType(i.type) ? i.type : undefined, terms: i.terms?.slice(0, 40) })),
  };
}

/** The server fn's body (see showcase.ts): serve the snapshot, rebuild stale ones behind the response. */
export async function serveShowcase(input: ShowcaseSpec): Promise<ShowcaseData> {
    const spec = valid(input);
    const h = await digest(JSON.stringify(spec));
    const raw = await env.SHARES?.get(SNAPSHOT(h));
    if (raw) {
      const snap = JSON.parse(raw) as Snapshot;
      // An incomplete page (some cards without photos) retries after 10 minutes, not a day: with the
      // per-card cache each retry only reads what is missing, so it fills in within a few visits.
      const maxAge = snap.complete ? DAY : 10 * 60_000;
      if (Date.now() - snap.builtAt > maxAge && !(await env.SHARES?.get(LOCK(h)))) {
        // Stale: serve it now, rebuild behind the response. Best effort: waitUntil gets ~30s after the
        // response and a cold build can take longer — then the stale copy stays and the daily cron
        // (15-min limit) is what actually turns it over. KV locks are best-effort; worst case two rebuilds.
        await env.SHARES?.put(LOCK(h), "1", { expirationTtl: 120 });
        waitUntil(refresh(spec, h, snap).catch((err) => console.error("showcase refresh failed", err)));
      }
      return snap.data;
    }
    // First request for this spec ever: remember it for the cron, build once, inline.
    await env.SHARES?.put(SPEC(h), JSON.stringify(spec));
    return (await refresh(spec, h, null)).data;
}

/** Cron: rebuild every known spec, so the home turns over daily with no visitor waiting. */
export async function refreshAllShowcases(): Promise<number> {
  if (!env.SHARES?.list) return 0;
  const { keys } = await env.SHARES.list({ prefix: "showcase-spec:" });
  let n = 0;
  for (const { name } of keys) {
    const raw = await env.SHARES.get(name);
    if (!raw) continue;
    const h = name.slice("showcase-spec:".length);
    const prev = await env.SHARES.get(SNAPSHOT(h));
    await refresh(JSON.parse(raw) as ShowcaseSpec, h, prev ? (JSON.parse(prev) as Snapshot) : null);
    n++;
  }
  return n;
}

async function digest(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
