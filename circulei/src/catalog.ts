import { findCity, fold, HUB_MIN, HUB_REACH_KM, km, pointOf, slug, type Point } from "./geo";
import type { Env } from "./env";

/**
 * Circulei's whole public catalog is ~260 pieces, so it lives as one KV snapshot,
 * rebuilt hourly by cron from decoindex (11 page reads). A visit never reads the
 * catalog upstream: it reads one KV key, and the isolate keeps it in memory.
 */
export interface Piece {
  handle: string;
  title: string;
  brand: string;
  images: string[];
  /** Price per day in BRL cents; a rental is at least 4 days. */
  daily: number;
  size: string;
  fits: string;
  owner: string;
  city: string;
  uf: string;
  /** The hub this piece is shown under (its own city, or the nearest big one). */
  hub: string;
  /** Owner's height in metres: the piece is photographed on, and fits, this body. */
  height?: number;
  body?: string;
  retail?: number;
  prova?: boolean;
  ajuste?: boolean;
  bride?: boolean;
  colors: string[];
  text: string;
}

export interface Hub {
  slug: string;
  city: string;
  uf: string;
  count: number;
  lat: number;
  lng: number;
}

export interface Snapshot {
  at: string;
  pieces: Piece[];
  hubs: Hub[];
  cities: { city: string; uf: string; count: number; lat: number; lng: number }[];
  /** Median of (4-day rental / retail price) across pieces that state both: the calculator's ratio. */
  rentRatio: number;
}

interface IndexProduct {
  slug: string;
  title: string;
  brand?: string;
  description?: string;
  images?: string[];
  variants?: { priceMinor?: number; available?: boolean }[];
  claims?: { predicate: string; value: string }[];
}

const COLORS = /^(azul|preto|roxo|amarelo|verde|laranja|dourado|rosa|bordô.*|bege|prateado|vermelho|branco|colorido|marrom|lilás|nude|off.?white|verde claro|azul claro|pink|fúcsia|estampado|candy brown)$/i;

const SIZE = "\\d{2}|PP|P|M|GG|G|U";
const SIZES = `(?:${SIZE})(?:,\\s*(?:${SIZE}))*`;

export function parsePiece(p: IndexProduct): Omit<Piece, "hub"> | null {
  const d = p.description ?? "";
  const at = d.search(/closet d[eo]/i);
  if (at < 0) return null;
  const seg = d.slice(at, at + 90).replace(/^closet d[eo]:?\s*/i, "");
  const place = findCity(seg);
  if (!place) return null;
  // Diacritic folding keeps lengths for Latin text, so the folded index is the original's.
  const cut = fold(seg).indexOf(fold(place.city));
  const owner = (cut > 0 ? seg.slice(0, cut) : seg.split(/[,.]/)[0]!).replace(/(,?\s*em)?\s*$/i, "").replace(/,\s*$/, "").trim();
  const daily = p.variants?.[0]?.priceMinor ?? 0;
  if (!daily) return null;
  const num = (re: RegExp) => d.match(re)?.[1];
  const height = Number((num(/altura:\s*([\d.,]+)\s*m\b/i) ?? "").replace(",", ".")) || undefined;
  const measures = ["busto", "cintura", "quadril"]
    .map((k) => [k, num(new RegExp(`${k}:\\s*(\\d+)\\s*cm`, "i"))])
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  const retail = num(/custo da peça:\s*([\d.]+,\d{2})/i);
  const yes = (k: string) => {
    const v = num(new RegExp(`${k}:\\s*(sim|não|nao)`, "i"));
    return v ? v.toLowerCase() === "sim" : undefined;
  };
  return {
    handle: p.slug.replace(/^\/products\//, ""),
    title: p.title,
    brand: p.brand ?? "",
    images: (p.images ?? []).slice(0, 4),
    daily,
    size: num(new RegExp(`etiqueta:\\s*(${SIZE})\\b`)) ?? num(new RegExp(`tamanhos:\\s*(${SIZES})`)) ?? num(new RegExp(`tamanho (${SIZE})\\b`, "i")) ?? "",
    fits: num(new RegExp(`serve nos tamanhos:?\\s*(${SIZES})`)) ?? "",
    owner,
    city: place.city,
    uf: place.uf,
    height: height && height > 1.3 && height < 2.1 ? height : undefined,
    body: measures || undefined,
    retail: retail ? Math.round(Number(retail.replace(/\./g, "").replace(",", ".")) * 100) : undefined,
    prova: yes("aceita prova"),
    ajuste: yes("permite ajustes"),
    colors: (p.claims ?? []).filter((c) => c.predicate === "tag" && COLORS.test(c.value)).map((c) => c.value.toLowerCase()),
    text: d.slice(0, 600),
  };
}

/** Big cities become hubs; every other piece joins the nearest hub within reach, else stays in its own city. */
export function group(raw: Omit<Piece, "hub">[]): Pick<Snapshot, "pieces" | "hubs" | "cities"> {
  const byCity = new Map<string, { city: string; uf: string; count: number } & Point>();
  for (const p of raw) {
    const pt = pointOf(p.city);
    if (!pt) continue;
    const c = byCity.get(p.city) ?? { city: p.city, uf: p.uf, count: 0, ...pt };
    c.count++;
    byCity.set(p.city, c);
  }
  const cities = [...byCity.values()].sort((a, b) => b.count - a.count);
  const big = cities.filter((c) => c.count >= HUB_MIN);
  const hubOf = (city: string) => {
    const pt = pointOf(city)!;
    if (big.some((b) => b.city === city)) return city;
    const near = big.map((b) => ({ b, d: km(pt, b) })).sort((x, y) => x.d - y.d)[0];
    return near && near.d <= HUB_REACH_KM ? near.b.city : city;
  };
  const pieces = raw.filter((p) => pointOf(p.city)).map((p) => ({ ...p, hub: hubOf(p.city) }));
  const counts = new Map<string, number>();
  for (const p of pieces) counts.set(p.hub, (counts.get(p.hub) ?? 0) + 1);
  const hubs = [...counts]
    .filter(([, n]) => n >= HUB_MIN)
    .map(([city, count]) => ({ slug: slug(city), city, uf: pointOf(city) && byCity.get(city)!.uf, count, ...pointOf(city)! }) as Hub)
    .sort((a, b) => b.count - a.count);
  return { pieces, hubs, cities };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

export async function build(env: Env): Promise<Snapshot> {
  const get = async (path: string) => {
    const req = new Request(`https://decoindex.com/circulei.co${path}`, { headers: { accept: "application/json" } });
    const res = await (env.INDEX ? env.INDEX.fetch(req) : fetch(req));
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as { products?: IndexProduct[] };
  };
  const all: IndexProduct[] = [];
  // ponytail: 20 pages caps the read budget at 480 pieces; raise it when the catalog outgrows it.
  for (let page = 1; page <= 20; page++) {
    const d = await get(`/collections/all.json?page=${page}`);
    const list = d?.products ?? [];
    all.push(...list);
    if (list.length < 24) break;
  }
  const bride = new Set(((await get("/collections/bride-to-be.json"))?.products ?? []).map((p) => p.slug));
  const seen = new Set<string>();
  const raw = all
    .filter((p) => p.variants?.some((v) => v.available) && !seen.has(p.slug) && seen.add(p.slug))
    .map((p) => {
      const piece = parsePiece(p);
      return piece && { ...piece, bride: bride.has(p.slug) };
    })
    .filter((p): p is NonNullable<typeof p> => !!p);
  const g = group(raw);
  const rentRatio = median(g.pieces.filter((p) => p.retail).map((p) => (p.daily * 4) / p.retail!)) || 0.3;
  return { at: new Date().toISOString(), ...g, rentRatio };
}

const KEY = "circulei:snapshot:v1";
let memo: { snap: Snapshot; at: number } | null = null;

/** Memory, then KV; only the very first request ever builds inline. A rebuild never replaces a good snapshot with an empty one. */
export async function snapshot(env: Env, ctx?: ExecutionContext): Promise<Snapshot> {
  if (memo && Date.now() - memo.at < 5 * 60_000) return memo.snap;
  const stored = await env.KV.get<Snapshot>(KEY, "json");
  if (stored) {
    memo = { snap: stored, at: Date.now() };
    return stored;
  }
  const fresh = await build(env);
  if (fresh.pieces.length) ctx ? ctx.waitUntil(env.KV.put(KEY, JSON.stringify(fresh))) : await env.KV.put(KEY, JSON.stringify(fresh));
  memo = { snap: fresh, at: Date.now() };
  return fresh;
}

export async function rebuild(env: Env): Promise<number> {
  const fresh = await build(env);
  const old = await env.KV.get<Snapshot>(KEY, "json");
  if (fresh.pieces.length < (old?.pieces.length ?? 0) * 0.7) {
    console.error("circulei rebuild shrank", fresh.pieces.length, "vs", old?.pieces.length);
    return 0;
  }
  await env.KV.put(KEY, JSON.stringify(fresh));
  return fresh.pieces.length;
}
