import { env, waitUntil } from "cloudflare:workers";
import type { Tile } from "../types";
import { BRANDS, type Segment } from "./brands";
import { findProducts, type Sort } from "./find";
import { newHealth, type Health } from "./catalog";
import { TYPES, TYPE_NAMES, detectType, overlap, words, type ProductType } from "./taxonomy";

/**
 * Real product photos for the home's cards, ideas and shelves — a daily index,
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
  cards: { type: ProductType }[];
  ideas: { type?: ProductType; terms?: string }[];
  shelves: { domain: string; type?: ProductType; terms?: string; sort?: Sort }[];
}

export interface ShowcaseData {
  cards: Tile[][];
  ideas: (Tile | null)[];
  shelves: Tile[][];
}

interface Snapshot {
  data: ShowcaseData;
  builtAt: number;
  complete: boolean;
}

const DAY = 86_400_000;
const SNAPSHOT = (h: string) => `showcase:v4:${h}`;
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
    if (SHOES.includes(type)) return has(b, "calcados") || (has(b, "esporte") && type === "tenis");
    if (BAGS.includes(type)) return has(b, "bolsas") || has(b, dept);
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
function heroScore(t: Tile, type: ProductType, want: string[]): number {
  const first = words(t.title)[0] ?? "";
  const hasTerms = !want.length || overlap(want, `${t.title} ${t.description ?? ""}`) > 0;
  if (!hasTerms) return 0;
  if ((TYPES[type] as readonly string[]).includes(first)) return 2;
  return detectType(`${t.title} ${t.category ?? ""}`) === type ? 1 : 0;
}

async function sample(
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
  // Prefer stores with a real category for the type; fall back to their search
  // (no store has a "biquíni" category, but several sell biquínis). Bounded:
  // with failing reads this once walked all ~57 brands per card (~1,000 reads/visit).
  const out: Tile[][] = [];
  const searched: Tile[][] = [];
  let tries = 0;
  for (const b of deptBrands(spec.dept, type, day, item)) {
    if (out.length >= 3 || out.length + searched.length >= 4) break;
    if (++tries > MAX_TRIES || health.ok + health.failed >= ITEM_BUDGET) break;
    const f = await findProducts({ env, ip: IP, dept: spec.dept, health }, { domain: b.domain, type, terms });
    // Best photos first; a store whose best is score 0 still counts, but sorts last.
    const withImg = f.tiles
      .filter((t) => t.images[0])
      .map((t, i) => ({ t, i, s: heroScore(t, type, want) }))
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
  const health = newHealth();
  const taken = new Set<string>();
  // Ideas first and sequential: they are the big photos and must be unique; then cards in parallel.
  const ideas: (Tile | null)[] = [];
  for (const [k, i] of spec.ideas.entries()) ideas.push(i.type ? ((await sample(spec, i.type, i.terms, 1, day, k, taken))[0] ?? null) : null);
  const [cards, shelves] = await Promise.all([
    Promise.all(spec.cards.map((c, k) => sample(spec, c.type, undefined, 3, day, k + 10, taken))),
    Promise.all(
      spec.shelves.map(async (s) =>
        (await findProducts({ env, ip: IP, dept: spec.dept, health }, { domain: s.domain, type: s.type, terms: s.terms, sort: s.sort })).tiles
          .filter((t) => t.images[0])
          .slice(0, 12),
      ),
    ),
  ]);
  const complete =
    cards.every((c) => c.length) && shelves.every((s) => s.length) && ideas.every((t, i) => t || !spec.ideas[i].type);
  return { data: { cards, ideas, shelves }, builtAt: now, complete };
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
    cards: (spec.cards ?? []).filter((c) => isType(c.type)).slice(0, 10),
    ideas: (spec.ideas ?? []).slice(0, 6).map((i) => ({ type: isType(i.type) ? i.type : undefined, terms: i.terms?.slice(0, 40) })),
    shelves: (spec.shelves ?? [])
      .filter((s) => BRANDS.some((b) => b.domain === s.domain))
      .slice(0, 4)
      .map((s) => ({ domain: s.domain, type: isType(s.type) ? s.type : undefined, terms: s.terms?.slice(0, 40), sort: s.sort })),
  };
}

/** The server fn's body (see showcase.ts): serve the snapshot, rebuild stale ones behind the response. */
export async function serveShowcase(input: ShowcaseSpec): Promise<ShowcaseData> {
    const spec = valid(input);
    const h = await digest(JSON.stringify(spec));
    const raw = await env.SHARES?.get(SNAPSHOT(h));
    if (raw) {
      const snap = JSON.parse(raw) as Snapshot;
      if (Date.now() - snap.builtAt > DAY && !(await env.SHARES?.get(LOCK(h)))) {
        // Stale: serve it now, rebuild behind the response. KV locks are best-effort; worst case two rebuilds.
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
