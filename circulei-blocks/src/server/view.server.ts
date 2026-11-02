/**
 * Server-only. Reads circulei/'s KV snapshot and turns it into what each section renders.
 * The logic (catalog, hubs, search, labels) is circulei/'s, imported, so both versions show the
 * same pieces in the same order; only the rendering differs.
 */
import { env } from "cloudflare:workers";
import { snapshot, type Piece } from "../../../circulei/src/catalog";
import { km, pointOf } from "../../../circulei/src/geo";
import { context } from "../../../circulei/src/index";
import { heightBand, hubsFor, isHere, reach, showcase, type Ctx } from "../../../circulei/src/html";
import type { CardData, HubLink, Place } from "../types";

// One Ctx per request, however many sections ask for it.
const memo = new WeakMap<Request, Promise<Ctx>>();
export function ctxFor(req: Request): Promise<Ctx> {
  let c = memo.get(req);
  if (!c) memo.set(req, (c = snapshot(env).then((snap) => context(req, snap))));
  return c;
}

const thumb = (u: string, w: number) => `${u}${u.includes("?") ? "&" : "?"}width=${w}`;

export function card(p: Piece, ctx: Ctx, tag = true): CardData {
  const r = reach(p, ctx);
  return {
    handle: p.handle,
    title: p.title,
    brand: p.brand,
    img: p.images[0] ?? "",
    alt: p.images[1],
    price4: p.daily * 4,
    size: p.size,
    sizes: [p.size, p.fits].join(",").replace(/\s/g, ""),
    h: heightBand(p.height),
    tag: tag || !r.near ? r : null,
  };
}

export function place(ctx: Ctx): Place {
  const hub = ctx.hub ? { slug: ctx.hub.slug, city: ctx.hub.city, uf: ctx.hub.uf } : null;
  const visitorCity = ctx.here?.city && ctx.hub && ctx.here.city !== ctx.hub.city && !ctx.chosen ? ctx.here.city : null;
  return { hub, here: isHere(ctx), visitorCity, total: ctx.snap.pieces.length };
}

export function hubs(ctx: Ctx, covers = false): HubLink[] {
  return hubsFor(ctx).map((h) => {
    const d = ctx.here ? Math.round(km(ctx.here, h)) : null;
    const cover = covers ? showcase(ctx.snap.pieces.filter((p) => p.hub === h.city))[0]?.images[0] : undefined;
    return {
      slug: h.slug,
      city: h.city,
      uf: h.uf,
      count: h.count,
      dist: d === null ? null : d < 30 ? "aqui" : `${d.toLocaleString("pt-BR")} km`,
      current: ctx.hub?.slug === h.slug,
      ...(cover ? { cover: thumb(cover, 540) } : {}),
    };
  });
}

export const local = (ctx: Ctx) => showcase(ctx.hub ? ctx.snap.pieces.filter((p) => p.hub === ctx.hub!.city) : ctx.snap.pieces);
export const away = (ctx: Ctx) => showcase(ctx.hub ? ctx.snap.pieces.filter((p) => p.hub !== ctx.hub!.city) : []);

/**
 * One photo on top. The first piece from `featured` (picked in Studio) that is in this city; else
 * the city's most luxurious worn dress. A mix of backgrounds side by side read as amateur.
 */
export function hero(ctx: Ctx, featured: string[] = []) {
  const l = local(ctx);
  const dresses = l.filter((p) => /^vestido/i.test(p.title) && p.height && p.images.length > 1);
  const p = featured.map((h) => l.find((x) => x.handle === h)).find(Boolean) ?? [...(dresses.length ? dresses : l)].sort((a, b) => b.daily - a.daily)[0];
  return {
    place: place(ctx),
    count: l.length,
    feature: p ? { handle: p.handle, title: p.title, brand: p.brand, img: p.images[0] ?? "", price4: p.daily * 4 } : null,
  };
}

export function near(ctx: Ctx) {
  const l = local(ctx);
  const sizes = ["34", "36", "38", "40", "42", "P", "M"].filter((s) => l.some((p) => `${p.size},${p.fits}`.includes(s)));
  return { place: place(ctx), sizes, cards: l.map((p) => card(p, ctx, p.city !== ctx.hub?.city)) };
}

export function rail(ctx: Ctx) {
  const a = away(ctx);
  return { total: ctx.snap.pieces.length, count: a.length, cities: new Set(a.map((p) => p.city)).size, cards: a.slice(0, 16).map((p) => card(p, ctx)) };
}

export function lenderStats(ctx: Ctx) {
  const { snap } = ctx;
  const cover = showcase(snap.pieces.filter((p) => /^vestido/i.test(p.title)))[0];
  return {
    owners: new Set(snap.pieces.map((p) => `${p.owner}|${p.city}`)).size,
    cities: snap.cities.length,
    pieces: snap.pieces.length,
    cover: cover ? { img: cover.images[0] ?? "", title: cover.title, brand: cover.brand, owner: cover.owner } : null,
    brands: [...new Set(snap.pieces.map((p) => p.brand).filter((b) => b && !/circulei|sob medida/i.test(b)))].slice(0, 16),
  };
}

export function pdp(ctx: Ctx, handle: string) {
  const p = ctx.snap.pieces.find((x) => x.handle === handle);
  if (!p) return null;
  const pt = pointOf(p.city);
  const d = ctx.here && pt ? Math.round(km(ctx.here, pt)) : null;
  const similar = ctx.snap.pieces
    .filter((x) => x.handle !== p.handle)
    .map((x) => ({ x, s: (x.size && x.size === p.size ? 2 : 0) + (ctx.hub && x.hub === ctx.hub.city ? 1 : 0) + (x.brand === p.brand ? 0.5 : 0) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((y) => card(y.x, ctx));
  return {
    piece: {
      handle: p.handle,
      title: p.title,
      brand: p.brand,
      images: p.images,
      price4: p.daily * 4,
      daily: p.daily,
      owner: p.owner,
      city: p.city,
      uf: p.uf,
      dist: d === null ? null : d < 30 ? "na sua cidade" : `a ${d.toLocaleString("pt-BR")} km de você`,
      motoboy: d !== null && d < 60,
      facts: [
        ["Tamanho", [p.size, p.fits && `serve ${p.fits}`].filter(Boolean).join(" · ")],
        ["Veste este corpo", [p.height && `${p.height.toFixed(2).replace(".", ",")} m`, p.body].filter(Boolean).join(" · ")],
        ["Prova", p.prova === undefined ? "" : p.prova ? "aceita prova" : "não aceita prova"],
        ["Ajustes", p.ajuste === undefined ? "" : p.ajuste ? "permite ajustes, combinados com a Circulei" : "não permite ajustes"],
        ["Valor da peça", p.retail ? `R$ ${Math.round(p.retail / 100).toLocaleString("pt-BR")}` : ""],
      ].filter(([, v]) => v) as [string, string][],
    },
    similar,
  };
}
