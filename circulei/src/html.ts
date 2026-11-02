import type { Hub, Piece, Snapshot } from "./catalog";
import { km, pointOf, type Point } from "./geo";

export interface Ctx {
  snap: Snapshot;
  /** The city being shown; null = Brasil todo. */
  hub: Hub | null;
  /** Where the visitor is, from Cloudflare; null off-network or abroad. */
  here: (Point & { city: string | null }) | null;
  /** True when the hub was picked by the visitor rather than by us. */
  chosen: boolean;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const brl = (cents: number) => `R$ ${Math.round(cents / 100).toLocaleString("pt-BR")}`;
const img = (u: string, w: number) => `${u}${u.includes("?") ? "&" : "?"}width=${w}`;
const srcset = (u: string) => [360, 540, 800, 1100].map((w) => `${img(u, w)} ${w}w`).join(", ");
const SHOP = "https://www.circulei.co";
export const outbound = (handle: string) => `${SHOP}/products/${encodeURIComponent(handle)}?ref=decoindex`;
const LENDER_FORM = "https://aporte-sua-peca.circulei.co/";
const WHATSAPP = "https://wa.me/message/NFYDMJGPIXVEI1";
// Circulei's own wordmark files, as their site serves them.
const LOGO = "https://cdn.shopify.com/s/files/1/0954/5600/2352/files/";
const LOGO_BLACK = `${LOGO}CIRCULEI_PRETA_PNG_627b741a-4770-4a43-b653-60b6f52139c1.png`;
const LOGO_WHITE = `${LOGO}CIRCULEI_BRANCA_PNG_30bb6b18-8157-4532-9a05-bd0ddc5216b4.png`;
export const logo = (white = false) => `<img src="${white ? LOGO_WHITE : LOGO_BLACK}" alt="Circulei" width="154" height="20">`;

/** The deck's label: an orange square, tracked caps. */
export const kick = (t: string) => `<p class="k"><i aria-hidden="true"></i>${t}</p>`;

export const PIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
export const ARROW = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

/** Hubs nearest first when we know where the visitor is, so "aqui" leads; else biggest first. */
export const hubsFor = (ctx: Ctx) => (ctx.here ? [...ctx.snap.hubs].sort((a, b) => km(ctx.here!, a) - km(ctx.here!, b)) : ctx.snap.hubs);

/** Same city: "na sua cidade"; otherwise where it ships from. */
/** The visitor is really in (or next to) the city on screen, not just browsing it from elsewhere. */
export const isHere = (ctx: Ctx) => !!ctx.here && !!ctx.hub && km(ctx.here, ctx.hub) < 60;

/**
 * The photo's tag. "na sua cidade" only when the visitor is actually there: someone in Rio
 * browsing São Paulo sees "São Paulo". `near` = the piece belongs to the city on screen.
 */
export function reach(p: Piece, ctx: Ctx): { near: boolean; label: string } {
  const pt = pointOf(p.city);
  const d = ctx.here && pt ? km(ctx.here, pt) : null;
  const local = d !== null && d < 60;
  if (ctx.hub && p.hub === ctx.hub.city) return { near: true, label: local ? "na sua cidade" : p.city };
  return { near: false, label: local ? `${p.city} · pertinho` : `${p.city} · envio` };
}

export const heightBand = (h?: number) => (!h ? "" : h < 1.6 ? "a" : h < 1.65 ? "b" : h < 1.7 ? "c" : "d");

export function card(p: Piece, ctx: Ctx, i = 0, tag = true): string {
  const r = reach(p, ctx);
  const first = p.images[0] ?? "";
  const second = p.images[1];
  return `<a class="card" href="/p/${esc(p.handle)}" data-size="${esc([p.size, p.fits].join(",").replace(/\s/g, ""))}" data-h="${heightBand(p.height)}" style="--i:${i % 12}">
  <span class="ph">
    <img src="${esc(img(first, 540))}" srcset="${esc(srcset(first))}" sizes="(min-width: 1100px) 22vw, (min-width: 700px) 30vw, 46vw" alt="${esc(p.title)}, ${esc(p.brand)}" loading="${i < 4 ? "eager" : "lazy"}" decoding="async">
    ${second ? `<img class="alt" src="${esc(img(second, 540))}" alt="" loading="lazy" decoding="async">` : ""}
    ${tag || !r.near ? `<span class="tag${r.near ? " near" : ""}">${esc(r.label)}</span>` : ""}
  </span>
  <span class="meta">
    <span class="brand">${esc(p.brand)}</span>
    <span class="title">${esc(p.title)}</span>
    <span class="row"><b>${brl(p.daily * 4)}</b><span>4 dias</span>${p.size ? `<span class="size">${esc(p.size)}</span>` : ""}</span>
  </span>
</a>`;
}

export function head(title: string, desc: string, image?: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex"><meta name="theme-color" content="#ffffff">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${image ? `<meta property="og:image" content="${esc(img(image, 1200))}">` : ""}
<link rel="preload" href="/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://cdn.shopify.com" crossorigin>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#000"/><rect x="11" y="11" width="10" height="10" fill="#e0560e"/></svg>')}">
<style>${CSS}</style></head>`;
}

function header(ctx: Ctx, path = "/"): string {
  const label = ctx.hub ? ctx.hub.city : "Brasil todo";
  const where = ctx.here?.city && ctx.hub && ctx.here.city !== ctx.hub.city && !ctx.chosen ? `Você está em ${ctx.here.city}. ` : "";
  const hubs = hubsFor(ctx)
    .map((h) => {
      const d = ctx.here ? Math.round(km(ctx.here, h)) : null;
      return `<a href="${path}?cidade=${h.slug}" ${ctx.hub?.slug === h.slug ? 'aria-current="true"' : ""}><span>${esc(h.city)} <small>${esc(h.uf)}</small></span><span class="n">${h.count} peças${d !== null ? ` · ${d < 30 ? "aqui" : `${d.toLocaleString("pt-BR")} km`}` : ""}</span></a>`;
    })
    .join("");
  return `<header class="top">
  <a class="logo" href="/" aria-label="Circulei, início">${logo()}</a>
  <button class="city" popovertarget="cities" aria-label="Cidade: ${esc(label)}. Trocar">${PIN}<span>${esc(label)}</span></button>
  <nav><a href="/seja-locadora" class="lend">Quero circular</a></nav>
  <div id="cities" popover class="cities">
    <p class="hint">${where}Mostramos primeiro as peças da cidade mais perto de você. Tudo também chega por envio, pra todo o Brasil.</p>
    ${hubs}
    <a href="${path}?cidade=brasil" ${ctx.hub ? "" : 'aria-current="true"'}><span>Brasil todo</span><span class="n">${ctx.snap.pieces.length} peças</span></a>
  </div>
</header>`;
}

export const footer = `<footer class="foot">
  <div class="wrap">
    <a class="logo" href="/">${logo(true)}</a>
    <p class="tagline"><b>O closet parado vira renda,</b> e a peça vira ativo.</p>
    <nav>
      <a href="${SHOP}/pages/para-alugar">Como alugar</a>
      <a href="${SHOP}/pages/perguntas-frequentes">Perguntas frequentes</a>
      <a href="${SHOP}/policies/refund-policy">Política de danos</a>
      <a href="https://www.instagram.com/circulei">Instagram</a>
      <a href="${WHATSAPP}">WhatsApp</a>
    </nav>
    <p class="fine">Protótipo de vitrine feito pela <a href="https://deco.cx">deco</a> sobre o catálogo público da Circulei. Reservas e pagamentos acontecem em circulei.co.</p>
  </div>
</footer>`;

/** Occasions in season first: November is formaturas and fim de ano. */
export function occasions(): string[] {
  const m = new Date().getUTCMonth();
  const season = m >= 9 || m <= 0 ? ["formatura à noite", "festa de fim de ano", "réveillon na praia"] : m <= 3 ? ["carnaval", "casamento de dia"] : ["festa junina chique", "casamento no inverno"];
  return ["casamento na praia, não curto decote", ...season, "madrinha de casamento", "noiva no civil", "jantar de aniversário"];
}

const isBag = (p: Piece) => /^(bolsa|clutch)/i.test(p.title);
/** Clothes before bags; worn photos (the owner states her height) before flat ones. */
export const showcase = (ps: Piece[]) =>
  [...ps].sort((a, b) => +isBag(a) - +isBag(b) || +!!b.height - +!!a.height || b.images.length - a.images.length);

/** One card per city with its own page: its best photo, how many pieces, how far. */
function cities(ctx: Ctx): string {
  const { snap } = ctx;
  const cards = hubsFor(ctx)
    .map((h) => {
      const cover = showcase(snap.pieces.filter((p) => p.hub === h.city))[0];
      const d = ctx.here ? Math.round(km(ctx.here, h)) : null;
      const current = ctx.hub?.slug === h.slug;
      return `<a class="cc" href="/?cidade=${h.slug}#perto" ${current ? 'aria-current="true"' : ""}>
  ${cover ? `<img src="${esc(img(cover.images[0]!, 540))}" alt="" loading="lazy" decoding="async">` : ""}
  <span class="cc-t"><b>${esc(h.city)}</b><span>${h.count} peças${current ? " · você está aqui" : d !== null ? ` · ${d < 30 ? "aqui" : `${d.toLocaleString("pt-BR")} km`}` : ""}</span></span>
</a>`;
    })
    .join("");
  return `<section class="explore" aria-labelledby="explore-h">
  <div class="wrap">
    ${kick("Rede nacional de closets")}
    <h2 class="hb" id="explore-h">Explore outras cidades.<span class="dim">${snap.cities.length} cidades, ${snap.pieces.length} peças.</span></h2>
  </div>
  <div class="rail cities-rail">${cards}<a class="cc all" href="/?cidade=brasil#perto"><span class="cc-t"><b>Brasil todo</b><span>${snap.pieces.length} peças, enviadas pra você</span></span></a></div>
</section>`;
}

export function home(ctx: Ctx): string {
  const { snap, hub } = ctx;
  const local = showcase(hub ? snap.pieces.filter((p) => p.hub === hub.city) : snap.pieces);
  const away = showcase(hub ? snap.pieces.filter((p) => p.hub !== hub.city) : []);
  const dresses = local.filter((p) => /^vestido/i.test(p.title));
  // Hero: dresses only, worn (a stated height means the owner is in the photo), the most photographed first.
  const heroPicks = [...(dresses.length >= 3 ? dresses : local)].sort((a, b) => +!!b.height - +!!a.height || b.images.length - a.images.length || b.daily - a.daily).slice(0, 3);
  const fromRent = Math.min(...(dresses.length ? dresses : local).map((p) => p.daily * 4));
  const place = hub ? hub.city : "todo o Brasil";
  const occ = occasions();
  const sizes = ["34", "36", "38", "40", "42", "P", "M"].filter((s) => local.some((p) => `${p.size},${p.fits}`.includes(s)));
  return `${head(`Circulei · Alugue roupas incríveis ${hub ? `em ${hub.city}` : "perto de você"}`, `${local.length} peças de closets de ${place} para alugar por 4 dias, a partir de ${brl(fromRent)}.`, heroPicks[0]?.images[0])}
<body>
${header(ctx)}
<main>
<section class="hero">
  <div class="hero-copy">
    ${kick(hub ? `Closets de ${esc(hub.city)}` : "Closets do Brasil todo")}
    <h1 class="hw">Alugue roupas incríveis perto de você</h1>
    <p class="lede"><b>${local.length} peças nos closets de ${esc(place)},</b> ${hub ? "com entrega por motoboy na mesma cidade." : "enviadas pra você."}</p>
    <div class="stylist">
      <label for="q"><span>Personal stylist</span><em class="new">Novo</em></label>
      <form class="ask" action="/" role="search">
        <input id="q" name="q" autocomplete="off" enterkeyhint="search" placeholder="Conte a ocasião: ${esc(occ[0])}" data-ph='${esc(JSON.stringify(occ))}'>
        <input type="hidden" name="cidade" value="${esc(hub?.slug ?? "brasil")}">
        <button aria-label="Buscar">${ARROW}</button>
      </form>
      <div class="chips" aria-label="Ocasiões">${occ.slice(1, 6).map((o) => `<button type="button" data-q="${esc(o)}">${esc(o)}</button>`).join("")}</div>
    </div>
    <div class="hero-foot"><span>${PIN}${esc(hub ? `${hub.city}, ${hub.uf}` : "Brasil")}</span><span>Vestidos a partir de ${brl(fromRent)}</span></div>
  </div>
  <div class="hero-art" aria-label="Peças em ${esc(place)}">
    ${heroPicks.map((p, i) => `<a href="/p/${esc(p.handle)}" class="f f${i}"><img src="${esc(img(p.images[0]!, i === 0 ? 900 : 600))}" alt="${esc(p.title)}" fetchpriority="${i === 0 ? "high" : "auto"}" decoding="async"><span>${esc(p.brand)} · ${brl(p.daily * 4)}</span></a>`).join("")}
  </div>
</section>

<section id="busca" class="results" hidden aria-live="polite"></section>

<section class="near wrap" id="perto">
  <div class="sec-head">
    ${kick("Perto de você")}
    <h2 class="hb">${hub ? `Nos closets de ${esc(hub.city)}.` : "Nos closets do Brasil."}<span class="dim">${!hub ? "Escolha uma cidade pra ver o que está perto." : isHere(ctx) ? "Pra provar e receber aqui perto." : `Motoboy dentro de ${esc(hub.city)}. Pra você, enviamos.`}</span></h2>
  </div>
  <div class="filters" role="group" aria-label="Filtrar">
    <span class="fl">Tamanho</span>${sizes.map((s) => `<button type="button" class="f-size" aria-pressed="false" data-v="${s}">${s}</button>`).join("")}
    <span class="fl">Sua altura</span>${[["a", "até 1,59"], ["b", "1,60–1,64"], ["c", "1,65–1,69"], ["d", "1,70+"]].map(([v, l]) => `<button type="button" class="f-h" aria-pressed="false" data-v="${v}">${l}</button>`).join("")}
    <output class="count" aria-live="polite">${local.length} peças</output>
  </div>
  <div class="grid" id="grid">${local.map((p, i) => card(p, ctx, i, p.city !== hub?.city)).join("")}</div>
  <p class="empty" hidden>Nenhuma peça com esse filtro aqui. <a href="/?cidade=brasil#perto">Ver o Brasil todo</a>: tudo chega por envio.</p>
</section>

${away.length ? `<section class="away">
  <div class="wrap sec-head">${kick("Envio pra todo o Brasil")}<h2 class="hb">De outros closets.<span class="dim">${away.length} peças em ${new Set(away.map((p) => p.city)).size} cidades.</span></h2></div>
  <div class="rail">${away.slice(0, 16).map((p, i) => card(p, ctx, i + 8)).join("")}<a class="more" href="/?cidade=brasil#perto">Ver todas as ${snap.pieces.length} peças ${ARROW}</a></div>
</section>` : ""}

<section class="lend-cta">
  <div class="wrap lend-grid">
    <div>
      ${kick("Moda como ativo")}
      <h2 class="hb">Toda mulher tem dinheiro parado no armário.<span class="dim">A Circulei faz ele render.</span></h2>
      <p class="lede"><b>Você aporta a peça,</b> a Circulei cuida da curadoria, da vitrine e de quem aluga, e você recebe no mês seguinte.</p>
      <a class="btn light" href="/seja-locadora">Quero circular ${ARROW}</a>
    </div>
    ${calculator(snap)}
  </div>
</section>

<section class="how wrap">
  ${kick("Como funciona")}
  <h2 class="hb">Alugar é simples.<span class="dim">E a peça volta a girar.</span></h2>
  ${timeline([
    ["Escolha", "Veja tamanho, medidas da dona e onde a peça está. Muitas aceitam prova."],
    ["Reserve", "Escolha as datas no calendário da peça, com até cinco meses de antecedência."],
    ["Receba", "Motoboy na mesma cidade. Pro resto do Brasil, a peça viaja com nota fiscal."],
    ["Devolva", "Use, brilhe e devolva. A peça volta a girar."],
  ])}
</section>

${cities(ctx)}
</main>
${footer}
<script>${CLIENT}</script>
</body></html>`;
}

/** The deck's "como funciona": a rule with a square per step, the last one orange. */
export function timeline(steps: [string, string][]): string {
  return `<ol class="tl">${steps.map(([t, d], i) => `<li><i aria-hidden="true"></i><span class="n">${String(i + 1).padStart(2, "0")}</span><b>${t}</b><p>${d}</p></li>`).join("")}</ol>`;
}

function calculator(snap: Snapshot): string {
  const pct = Math.round(snap.rentRatio * 100);
  return `<div class="calc" data-ratio="${snap.rentRatio}">
  <label for="worth">Quanto custou sua peça?</label>
  <output class="worth" for="worth">R$ 1.500</output>
  <input id="worth" type="range" min="400" max="8000" step="100" value="1500">
  <p class="res">Peças assim alugam por cerca de <b class="rent">${brl(150000 * snap.rentRatio)}</b> por 4 dias. Em <b class="times">${Math.ceil(1 / snap.rentRatio)}</b> aluguéis, o valor da peça já circulou de volta.</p>
  <p class="fine">Estimativa a partir do catálogo de hoje: o aluguel de 4 dias fica em torno de ${pct}% do preço da peça. O preço final é definido com a curadoria.</p>
</div>`;
}

export function pdp(ctx: Ctx, p: Piece, similar: Piece[]): string {
  const pt = pointOf(p.city);
  const d = ctx.here && pt ? Math.round(km(ctx.here, pt)) : null;
  const near = d !== null && d < 60;
  const facts: [string, string][] = [
    ["Tamanho", [p.size, p.fits && `serve ${p.fits}`].filter(Boolean).join(" · ")],
    ["Veste este corpo", [p.height && `${p.height.toFixed(2).replace(".", ",")} m`, p.body].filter(Boolean).join(" · ")],
    ["Prova", p.prova === undefined ? "" : p.prova ? "aceita prova" : "não aceita prova"],
    ["Ajustes", p.ajuste === undefined ? "" : p.ajuste ? "permite ajustes, combinados com a Circulei" : "não permite ajustes"],
    ["Valor da peça", p.retail ? brl(p.retail) : ""],
  ];
  return `${head(`${p.title} · ${p.brand} · Circulei`, `Alugue ${p.title} (${p.brand}) por ${brl(p.daily * 4)} por 4 dias. Do closet de ${p.owner}, ${p.city}.`, p.images[0])}
<body class="pdp-page">
${header(ctx, `/p/${p.handle}`)}
<main class="pdp wrap">
  <div class="gallery" aria-label="Fotos">${p.images.map((u, i) => `<button type="button" class="zoom" data-i="${i}" aria-label="Ampliar foto ${i + 1} de ${p.images.length}"><img src="${esc(img(u, 900))}" srcset="${esc(srcset(u))}" sizes="(min-width: 900px) 50vw, 92vw" alt="${esc(p.title)}, foto ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></button>`).join("")}</div>
  <dialog class="lightbox" aria-label="Fotos de ${esc(p.title)}">
    <div class="lb-track">${p.images.map((u, i) => `<img src="${esc(img(u, 1600))}" alt="${esc(p.title)}, foto ${i + 1}" loading="lazy" decoding="async">`).join("")}</div>
    <p class="lb-n" aria-live="polite">1 / ${p.images.length}</p>
    <button type="button" class="lb-x" aria-label="Fechar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <button type="button" class="lb-prev" aria-label="Foto anterior"><svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button>
    <button type="button" class="lb-next" aria-label="Próxima foto">${ARROW}</button>
  </dialog>
  <div class="info">
    ${kick(esc(p.brand))}
    <h1 class="hb">${esc(p.title)}</h1>
    <p class="price"><b>${brl(p.daily * 4)}</b><span>por 4 dias · ${brl(p.daily)} por dia</span></p>
    <p class="where${near ? " near" : ""}">${PIN}
      <span>Do closet de <b>${esc(p.owner)}</b>, ${esc(p.city)}, ${esc(p.uf)}${d !== null ? ` · ${d < 30 ? "na sua cidade" : `a ${d.toLocaleString("pt-BR")} km de você`}` : ""}.
      <small>${d !== null && d < 60 ? "Entrega por motoboy." : "Enviamos pra você, com nota fiscal."}</small></span>
    </p>
    <dl>${facts.filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    <a class="btn rent" href="${esc(outbound(p.handle))}">Escolher datas na Circulei ${ARROW}</a>
    <p class="fine">Reserva, pagamento e entrega acontecem em circulei.co.</p>
  </div>
</main>
<div class="buybar"><span><b>${brl(p.daily * 4)}</b> 4 dias</span><a class="btn rent" href="${esc(outbound(p.handle))}">Escolher datas</a></div>
${similar.length ? `<section class="wrap similar">${kick("Pra você também")}<h2 class="hb">Combina com você.<span class="dim">No seu tamanho, perto de você.</span></h2><div class="grid">${similar.map((s, i) => card(s, ctx, i)).join("")}</div></section>` : ""}
${footer}
<script>${CLIENT}</script>
</body></html>`;
}

export function lender(ctx: Ctx): string {
  const { snap } = ctx;
  const owners = new Set(snap.pieces.map((p) => `${p.owner}|${p.city}`)).size;
  const brands = [...new Set(snap.pieces.map((p) => p.brand).filter((b) => b && !/circulei|sob medida/i.test(b)))].slice(0, 16);
  const cover = showcase(snap.pieces.filter((p) => /^vestido/i.test(p.title)))[0];
  // Circulei's own yield comparison, from their deck (Oct 2026): gross, on the piece's cost.
  const yields: [string, number, string][] = [
    ["IFIX (fundos imobiliários)", 5.1, ""],
    ["IMA-B (títulos IPCA+)", 13.8, ""],
    ["CDI", 14.6, ""],
    ["Média das peças do site", 50.8, "avg"],
    ["Carteira curada da Circulei", 207, "top"],
  ];
  return `${head("Invista seu closet · Circulei", "O closet parado vira renda, e a peça vira ativo. Aporte suas peças na Circulei.", cover?.images[0])}
<body class="lender-page">
${header(ctx, "/seja-locadora")}
<main>
<section class="hero l-hero">
  <div class="hero-copy">
    ${kick("Moda como ativo")}
    <h1 class="hw">Invista seu closet</h1>
    <p class="lede"><b>O closet parado vira renda,</b> e a peça vira ativo.</p>
    <div class="l-actions"><a class="btn light" href="${LENDER_FORM}">Aportar minhas peças ${ARROW}</a><a class="btn ghost" href="${WHATSAPP}">Falar no WhatsApp</a></div>
    <div class="hero-foot"><span>${owners} closets</span><span>${snap.cities.length} cidades</span><span>${snap.pieces.length} peças no ar</span></div>
  </div>
  <div class="hero-art one">${cover ? `<span class="f f0"><img src="${esc(img(cover.images[0]!, 1000))}" alt="${esc(cover.title)}" fetchpriority="high"><span>${esc(cover.brand)} · closet de ${esc(cover.owner)}</span></span>` : ""}</div>
</section>

<section class="wrap roles">
  ${kick("O que fazemos")}
  <h2 class="hb">Toda mulher tem dinheiro parado no armário.<span class="dim">A Circulei faz ele render.</span></h2>
  <div class="cols">
    <div><span class="ib"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="1"/><path d="M3 10h18M16 14h2"/></svg></span><div><p class="k2">Quem tem closet</p><b>Ganha renda com a peça parada.</b></div></div>
    <div><span class="ib"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg></span><div><p class="k2">Quem aluga</p><b>Veste a peça que quer por uma fração do preço.</b></div></div>
    <div><span class="ib"><svg viewBox="0 0 24 24"><path d="m4 16 5-5 4 4 7-7M15 8h5v5"/></svg></span><div><p class="k2">Você decide</p><b>Prova, ajustes e o tamanho que ela veste.</b></div></div>
  </div>
</section>

<section class="yield">
  <div class="wrap y-grid">
    <div>
      ${kick("Moda como ativo")}
      <h2 class="hb">A peça curada rende.<span class="dim">Mais que o CDI.</span></h2>
      <p class="tl-label">Rendimento anual sobre o custo da peça</p>
      <table class="bars">${yields.map(([k, v, cls]) => `<tr class="y-${cls}"><th>${k}</th><td><i style="--w:${Math.max(1.5, (v / 207) * 100).toFixed(1)}%"></i></td><td class="v">${v.toLocaleString("pt-BR")}%</td></tr>`).join("")}</table>
      <p class="fine">Bruto, sobre o custo da peça. Números da Circulei. Não é promessa de retorno.</p>
    </div>
    ${calculator(snap)}
  </div>
</section>

<section class="wrap how">
  ${kick("Como funciona")}
  <h2 class="hb">Do armário ao repasse.<span class="dim">Em cinco passos.</span></h2>
  ${timeline([
    ["Cadastro", "Você manda fotos e medidas pelo formulário."],
    ["Curadoria", "Só 1 em cada 3 peças entra, com preço por peças comparáveis."],
    ["Reserva", "A cliente reserva com até cinco meses de antecedência e paga na hora."],
    ["Aluguel", "A peça viaja com nota fiscal do valor, pra todo o Brasil."],
    ["Repasse", "Você recebe no mês seguinte, e a peça volta a girar."],
  ])}
  <div class="l-actions"><a class="btn dark" href="${LENDER_FORM}">Aportar minhas peças ${ARROW}</a><a class="btn line" href="${SHOP}/pages/criterios-de-curadoria">Critérios de curadoria</a></div>
</section>

<section class="brands">
  <div class="wrap">
    ${kick("Já circulam por aqui")}
    <p class="brand-list">${brands.map(esc).join('<i aria-hidden="true"></i>')}</p>
  </div>
</section>
${cities(ctx)}
</main>
${footer}
<script>${CLIENT}</script>
</body></html>`;
}

export function notFound(ctx: Ctx): string {
  return `${head("Circulei", "Página não encontrada")}<body>${header(ctx)}<main class="wrap nf">${kick("404")}<h1 class="hb">Essa peça já circulou.<span class="dim">Ela pode ter sido alugada ou saído do acervo.</span></h1><a class="btn dark" href="/">Ver o que está perto de você ${ARROW}</a></main>${footer}<script>${CLIENT}</script></body></html>`;
}

export const CSS = `
@font-face{font-family:Archivo;font-style:normal;font-weight:300 900;font-stretch:62% 125%;font-display:swap;src:url(/fonts/archivo-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
:root{
  --ink:oklch(0.13 0 0);--ink-2:oklch(0.44 0 0);--dim:oklch(0.64 0 0);--bg:oklch(1 0 0);--stone:oklch(0.96 0.004 85);--line:oklch(0.88 0 0);
  --black:oklch(0.08 0 0);--on-black-2:oklch(0.72 0 0);--on-black-dim:oklch(0.52 0 0);--rule-dark:oklch(0.3 0 0);
  --orange:oklch(0.63 0.19 42);
  --sans:Archivo,ui-sans-serif,system-ui,sans-serif;
  --gut:clamp(16px,4vw,56px);--ease:cubic-bezier(.22,1,.36,1);
  color-scheme:light;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:400 16px/1.55 var(--sans);font-stretch:100%;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{display:block;max-width:100%}
a{color:inherit}
h1,h2,h3{text-wrap:balance;margin:0}
p{text-wrap:pretty}
svg{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.wrap{max-width:1360px;margin:0 auto;padding:0 var(--gut)}
.k{display:flex;align-items:center;gap:10px;margin:0 0 18px;font:600 12px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}
.k i{width:9px;height:9px;background:var(--orange);flex:none}
.hero-copy,.wrap{container-type:inline-size}
.hw{font:500 clamp(1.5rem,8cqi,3.7rem)/1.04 var(--sans);font-stretch:125%;letter-spacing:.01em;text-transform:uppercase}
.hb{font:800 clamp(1.9rem,3.6vw,3.3rem)/1.02 var(--sans);letter-spacing:-.025em;text-transform:uppercase}
.hb .dim{display:block;color:var(--dim)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 24px;font:600 14px var(--sans);letter-spacing:.08em;text-transform:uppercase;text-decoration:none;border:1px solid transparent;cursor:pointer;transition:background .2s,color .2s,border-color .2s}
.btn svg{width:18px;height:18px;stroke-width:2;transition:transform .3s var(--ease)}
.btn:hover svg{transform:translateX(3px)}
.btn.dark{background:var(--ink);color:#fff}.btn.dark:hover{background:var(--orange)}
.btn.light{background:#fff;color:var(--ink)}.btn.light:hover{background:var(--orange);color:#fff}
.btn.ghost{border-color:currentColor;color:#fff}.btn.ghost:hover{background:#fff;color:var(--ink)}
.btn.line{border-color:var(--ink)}.btn.line:hover{background:var(--ink);color:#fff}
.fine{font-size:13px;color:var(--ink-2)}

/* header */
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:0 var(--gut);height:68px;background:#fff;border-bottom:1px solid var(--line)}
.logo img{width:132px;height:auto}
.city{display:inline-flex;align-items:center;gap:8px;margin-left:auto;height:40px;padding:0 14px;border:1px solid var(--line);background:#fff;color:var(--ink);font:600 12px var(--sans);letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.city:hover{border-color:var(--ink)}
.city svg{width:16px;height:16px}
.top nav a{display:inline-flex;align-items:center;height:40px;padding:0 16px;font:600 12px var(--sans);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;background:var(--ink);color:#fff;white-space:nowrap}
.top nav a:hover{background:var(--orange)}
.cities{margin:0;inset:auto;top:76px;right:var(--gut);left:auto;position:fixed;width:min(380px,calc(100vw - 2*var(--gut)));max-height:min(72vh,600px);overflow:auto;padding:8px;border:1px solid var(--ink);background:#fff;color:var(--ink);box-shadow:0 30px 60px -20px oklch(0 0 0/.3)}
.cities .hint{margin:8px 12px 12px;font-size:13px;color:var(--ink-2)}
.cities a{display:flex;justify-content:space-between;gap:12px;padding:12px;text-decoration:none;font-weight:600;border-top:1px solid var(--line)}
.cities a:hover{background:var(--stone)}
.cities a[aria-current]{background:var(--ink);color:#fff}
.cities a[aria-current] .n{color:var(--on-black-2)}
.cities small{font-weight:500;color:var(--dim)}
.cities .n{font-weight:500;color:var(--ink-2);font-size:14px}

/* hero: the deck's cover — black copy panel, photographs to the edge */
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.08fr);background:var(--black);color:#fff;min-height:min(calc(100svh - 68px),820px)}
.hero-copy{display:flex;flex-direction:column;justify-content:center;padding:clamp(36px,5vw,80px) var(--gut)}
.hero .k{color:var(--on-black-2)}
.lede{font-size:clamp(18px,1.6vw,22px);line-height:1.4;max-width:34ch;margin:22px 0 0;color:var(--on-black-2)}
.lede b{color:#fff;font-weight:600}
.stylist{margin-top:clamp(28px,4vw,44px);padding-top:clamp(22px,3vw,30px);border-top:1px solid var(--rule-dark);max-width:600px}
.stylist label{display:flex;align-items:center;gap:10px;font:600 12px var(--sans);letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px}
.new{font:700 10px var(--sans);font-style:normal;letter-spacing:.1em;background:var(--orange);color:#fff;padding:3px 6px}
.ask{display:flex;align-items:stretch;background:#fff}
.ask input{flex:1;min-width:0;border:0;outline:0;font:500 17px var(--sans);color:var(--ink);background:transparent;height:58px;padding:0 18px}
.ask input::placeholder{color:var(--ink-2)}
.ask button{flex:none;width:58px;border:0;background:var(--orange);color:#fff;cursor:pointer;display:grid;place-items:center}
.ask button svg{width:22px;height:22px;stroke-width:2.2;transition:transform .3s var(--ease)}
.ask button:hover svg{transform:translateX(3px)}
.ask:focus-within{outline:2px solid var(--orange);outline-offset:3px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chips button{font:500 14px var(--sans);color:#fff;background:transparent;border:1px solid var(--rule-dark);padding:8px 12px;cursor:pointer;transition:border-color .2s,background .2s}
.chips button:hover{border-color:#fff}
.hero-foot{display:flex;justify-content:space-between;gap:16px;margin-top:clamp(28px,4vw,48px);padding-top:16px;border-top:1px solid var(--rule-dark);font:600 12px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--on-black-2);max-width:600px}
.hero-foot span{display:inline-flex;align-items:center;gap:8px}
.hero-foot svg{width:15px;height:15px}
.hero-art{display:grid;grid-template-columns:1.35fr 1fr;grid-template-rows:1fr 1fr;gap:2px;min-height:420px}
.hero-art .f{position:relative;overflow:hidden;background:oklch(0.2 0 0);text-decoration:none;color:#fff}
.hero-art .f img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;transition:transform 1.4s var(--ease);animation:reveal 1.1s var(--ease) backwards}
.hero-art a.f:hover img{transform:scale(1.035)}
.hero-art .f>span{position:absolute;left:0;bottom:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:9px 12px;font:600 11px var(--sans);letter-spacing:.12em;text-transform:uppercase;background:var(--black)}
.f0{grid-row:1/3}.f1 img{animation-delay:.12s}.f2 img{animation-delay:.24s}
.hero-art.one{grid-template-columns:1fr;grid-template-rows:1fr}
@keyframes reveal{from{clip-path:inset(0 0 100% 0);transform:scale(1.06)}}
@keyframes rise{from{opacity:0;translate:0 18px}}

/* sections */
section{scroll-margin-top:76px}
.sec-head{margin-top:clamp(56px,8vw,112px);margin-bottom:24px}
.sec-head .hb{max-width:22ch}
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:12px 0;margin-bottom:18px;position:sticky;top:68px;z-index:5;background:var(--bg);border-top:1px solid var(--ink);border-bottom:1px solid var(--line)}
.filters .fl{font:600 11px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);margin:0 4px 0 14px}.filters .fl:first-child{margin-left:0}
.filters button{min-height:36px;min-width:40px;padding:0 12px;border:1px solid var(--line);background:#fff;font:500 14px var(--sans);color:var(--ink);cursor:pointer}
.filters button:hover{border-color:var(--ink)}
.filters button[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff}
.filters .count{margin-left:auto;font:600 11px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,44vw),1fr));gap:clamp(20px,2.4vw,36px) clamp(10px,1.4vw,20px)}
.card{text-decoration:none;display:block;animation:rise .7s var(--ease) backwards;animation-delay:calc(var(--i)*35ms)}
.ph{position:relative;display:block;aspect-ratio:3/4;overflow:hidden;background:var(--stone)}
.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 15%;transition:opacity .5s var(--ease),transform 1.2s var(--ease)}
.ph .alt{opacity:0}
@media (hover:hover){.card:hover .ph .alt{opacity:1}.card:hover .ph img{transform:scale(1.03)}}
.tag{position:absolute;left:0;top:0;font:600 10.5px var(--sans);letter-spacing:.12em;text-transform:uppercase;padding:7px 10px;background:#fff;color:var(--ink)}
.tag.near{background:var(--ink);color:#fff}
.tag.near::before{content:"";display:inline-block;width:7px;height:7px;background:var(--orange);margin-right:7px;vertical-align:1px}
.meta{display:grid;gap:3px;padding:12px 0 0}
.brand{font:600 11px var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2)}
.title{font-size:15px;line-height:1.3}
.row{display:flex;align-items:baseline;gap:6px;font-size:14px;color:var(--ink-2)}
.row b{color:var(--ink);font-weight:700;font-size:15px}
.row .size{margin-left:auto;font-weight:600;color:var(--ink);border:1px solid var(--ink);padding:0 6px;font-size:12px}
.card[hidden]{display:none}
.empty{padding:32px 0;color:var(--ink-2)}

.away{background:var(--stone);padding-bottom:clamp(48px,6vw,88px);margin-top:clamp(56px,8vw,112px)}
.away .sec-head{padding-top:clamp(48px,6vw,88px);margin-top:0}
.rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(210px,21vw);gap:clamp(10px,1.4vw,20px);overflow-x:auto;padding:0 max(var(--gut),calc((100vw - 1360px)/2 + var(--gut))) 12px;scroll-padding-inline:max(var(--gut),calc((100vw - 1360px)/2 + var(--gut)));scroll-snap-type:x mandatory;scrollbar-width:thin}
.rail>*{scroll-snap-align:start}
.rail .more{display:flex;align-items:flex-end;aspect-ratio:3/4;padding:20px;background:var(--ink);color:#fff;font:800 22px/1.1 var(--sans);text-transform:uppercase;letter-spacing:-.01em;text-decoration:none}
.rail .more svg{width:22px;height:22px;flex:none}
.rail .more:hover{background:var(--orange)}

/* results */
.results{padding:clamp(40px,5vw,72px) var(--gut) 0;max-width:1360px;margin:0 auto}
.results .hb{max-width:24ch}
.note{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;max-width:72ch;margin:26px 0 30px;padding:20px 22px;background:var(--black);color:#fff;font:400 18px/1.5 var(--sans)}
.note::before{content:"";width:9px;height:9px;background:var(--orange);margin-top:9px;grid-row:1/3}
.note .by{font:600 11px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--on-black-2)}
.note .tx:empty::before{content:"Olhando as peças com você…";color:var(--on-black-dim)}
.results .meta-line{font:600 12px var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);margin:14px 0 0}
.results .again,.results .close{font:inherit;letter-spacing:inherit;text-transform:inherit;background:none;border:0;color:var(--ink);cursor:pointer;padding:6px 0;text-decoration:underline;text-underline-offset:3px}
.skel{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,44vw),1fr));gap:20px;margin-top:26px}
.skel i{aspect-ratio:3/4;background:linear-gradient(100deg,var(--stone) 40%,#fff 50%,var(--stone) 60%) 0/300% 100%;animation:sh 1.2s linear infinite}
@keyframes sh{to{background-position:-150% 0}}
.thinking{display:flex;align-items:center;gap:10px;color:var(--ink-2);margin:16px 0 0;font-weight:500}
.thinking::before{content:"";width:9px;height:9px;background:var(--orange);animation:blink .8s steps(2) infinite}
@keyframes blink{50%{opacity:0}}

/* lender band */
.lend-cta{background:var(--black);color:#fff;margin-top:clamp(56px,8vw,112px);padding:clamp(56px,8vw,112px) 0}
.lend-cta .k{color:var(--on-black-2)}
.lend-cta .hb .dim{color:var(--on-black-dim)}
.lend-cta .lede{margin:22px 0 30px}
.lend-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:clamp(32px,5vw,96px);align-items:center}
.calc{background:#fff;color:var(--ink);padding:clamp(24px,3vw,40px);border:1px solid var(--ink)}
.calc label{font:600 12px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}
.calc .worth{display:block;font:800 clamp(2.6rem,4.6vw,4rem)/1.05 var(--sans);letter-spacing:-.03em;margin:8px 0 16px}
.calc input{width:100%;accent-color:var(--orange);height:28px}
.calc .res{font-size:17px;margin:18px 0 12px;padding-top:16px;border-top:1px solid var(--line)}
.calc .res b{color:var(--orange)}
.calc .fine{margin:0}

/* timeline, after the deck */
.how{margin-top:clamp(64px,9vw,128px);margin-bottom:clamp(64px,9vw,128px)}
.tl{list-style:none;padding:0;margin:44px 0 0;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:28px}
.tl li{position:relative;padding-top:30px;border-top:1px solid var(--ink);color:var(--ink-2)}
.tl li i{position:absolute;top:-7px;left:0;width:13px;height:13px;background:var(--ink)}
.tl li:last-child i{background:var(--orange)}
.tl .n{display:block;font:600 13px var(--sans);color:var(--dim);margin-bottom:6px}
.tl b{display:block;font:700 21px/1.2 var(--sans);color:var(--ink);margin-bottom:6px}
.tl p{margin:0;font-size:16px;max-width:28ch}
.how .l-actions{margin-top:44px}

/* explore other cities */
.explore{padding:clamp(56px,8vw,104px) 0;border-top:1px solid var(--line)}
.explore .hb{margin-bottom:32px}
.cities-rail{grid-auto-columns:minmax(220px,19vw)}
.cc{position:relative;display:block;aspect-ratio:3/4;overflow:hidden;background:var(--black);color:#fff;text-decoration:none}
.cc img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 15%;opacity:.8;transition:transform 1.2s var(--ease),opacity .4s}
.cc:hover img{transform:scale(1.04);opacity:.65}
.cc::after{content:"";position:absolute;inset:40% 0 0;background:linear-gradient(transparent,oklch(0 0 0/.75))}
.cc-t{position:absolute;z-index:1;left:0;right:0;bottom:0;padding:18px;display:grid;gap:4px}
.cc-t b{font:500 clamp(18px,1.7vw,24px)/1.1 var(--sans);font-stretch:125%;text-transform:uppercase;letter-spacing:.01em}
.cc-t span{font:600 11px var(--sans);letter-spacing:.14em;text-transform:uppercase;color:oklch(0.85 0 0)}
.cc[aria-current]{outline:3px solid var(--orange);outline-offset:-3px}
.cc.all{background:var(--orange)}
.cc.all::after{display:none}
.cc.all:hover{background:var(--ink)}

/* pdp */
.pdp{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:clamp(24px,4vw,72px);padding-top:clamp(20px,3vw,40px);align-items:start}
.gallery{display:grid;grid-template-columns:1fr 1fr;gap:2px}
.zoom{display:block;padding:0;border:0;background:var(--stone);cursor:zoom-in}
.gallery img{width:100%;aspect-ratio:3/4;object-fit:cover;object-position:50% 15%}
.zoom:first-child{grid-column:1/3}
.lightbox{width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:var(--black);color:#fff}
.lightbox::backdrop{background:var(--black)}
.lb-track{display:flex;height:100%;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.lb-track img{flex:none;width:100%;height:100%;object-fit:contain;scroll-snap-align:center}
.lightbox button{position:fixed;display:grid;place-items:center;width:52px;height:52px;border:1px solid oklch(1 0 0/.3);background:var(--black);color:#fff;cursor:pointer}
.lightbox button:hover{border-color:#fff}
.lightbox button svg{width:22px;height:22px;stroke-width:1.8}
.lb-x{top:16px;right:16px}
.lb-prev{left:16px;top:50%;translate:0 -50%}.lb-next{right:16px;top:50%;translate:0 -50%}
.lb-n{position:fixed;top:16px;left:16px;margin:0;padding:15px 16px;background:var(--black);font:600 12px var(--sans);letter-spacing:.16em}
.info{position:sticky;top:96px}
.info .hb{font-size:clamp(1.8rem,3vw,2.7rem)}
.price{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;margin:22px 0;padding:18px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--line)}
.price b{font:800 34px/1 var(--sans);letter-spacing:-.02em}
.price span{color:var(--ink-2)}
.where{display:grid;grid-template-columns:20px 1fr;gap:10px;align-items:start;margin:0;padding:16px;background:var(--stone);font-size:15px}
.where.near{background:var(--ink);color:#fff}
.where.near small{color:var(--on-black-2)}
.where svg{width:20px;height:20px;margin-top:1px;color:var(--orange)}
.where small{display:block;font-size:14px;color:var(--ink-2);margin-top:2px}
.info dl{margin:16px 0 24px}
.info dl div{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
.info dt{font:600 11px/1.9 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2)}
.info dd{margin:0;font-weight:500}
.btn.rent{width:100%;background:var(--ink);color:#fff;min-height:60px}
.btn.rent:hover{background:var(--orange)}
.buybar{display:none}
.similar{margin:clamp(64px,8vw,112px) auto}
.similar .hb{margin-bottom:28px}

/* lender page */
.l-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.roles{margin-top:clamp(64px,9vw,128px)}
.roles .hb{max-width:22ch}
.cols{display:grid;grid-template-columns:repeat(3,1fr);margin-top:44px;border-top:1px solid var(--ink)}
.cols>div{display:flex;gap:18px;padding:28px 28px 8px 0}
.cols>div+div{padding-left:28px;border-left:1px solid var(--line)}
.ib{flex:none;display:grid;place-items:center;width:54px;height:54px;border:1px solid var(--ink)}
.ib svg{width:24px;height:24px}
.k2{margin:0 0 6px;font:600 11px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}
.cols b{font:700 21px/1.25 var(--sans)}
.yield{background:var(--stone);margin-top:clamp(64px,9vw,128px);padding:clamp(56px,8vw,104px) 0}
.y-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:clamp(32px,5vw,96px);align-items:end}
.tl-label{margin:40px 0 0;font:600 12px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}
.bars{width:100%;border-collapse:collapse;margin:12px 0 14px}
.bars th{text-align:left;font-weight:400;font-size:16px;color:var(--ink-2);padding:13px 12px 13px 0;width:46%}
.bars td{padding:13px 0;border-top:1px solid var(--line)}
.bars th{border-top:1px solid var(--line)}
.bars td i{display:block;height:14px;width:var(--w);background:oklch(0.72 0 0)}
.bars .v{text-align:right;font-weight:700;width:76px;font-variant-numeric:tabular-nums}
.bars .y-avg th{color:var(--ink);font-weight:700}.bars .y-avg i{background:var(--ink)}
.bars .y-top th,.bars .y-top td{border-top:1px solid var(--ink)}
.bars .y-top th{color:var(--ink);font-weight:800}
.bars .y-top i{background:var(--orange);height:26px}
.bars .y-top .v{font-size:28px;font-weight:600}
.brands{background:var(--black);color:#fff;padding:clamp(56px,8vw,104px) 0}
.brands .k{color:var(--on-black-2)}
.brand-list{margin:0;font:500 clamp(22px,2.8vw,40px)/1.35 var(--sans);font-stretch:125%;text-transform:uppercase}
.brand-list i{display:inline-block;width:.32em;height:.32em;background:var(--orange);margin:0 .5em;vertical-align:.18em}
.lender-page .explore{border-top:0}
.nf{min-height:60vh;padding-top:80px}.nf .btn{margin-top:32px}

/* footer */
.foot{background:var(--black);color:#fff;padding:64px 0 44px}
.foot .logo img{width:150px}
.tagline{font-size:20px;color:var(--on-black-2);margin:22px 0 0}.tagline b{color:#fff;font-weight:600}
.foot nav{display:flex;flex-wrap:wrap;gap:10px 26px;margin:30px 0;padding-top:22px;border-top:1px solid var(--rule-dark)}
.foot nav a{font:600 12px var(--sans);letter-spacing:.14em;text-transform:uppercase;text-decoration:none;color:var(--on-black-2)}
.foot nav a:hover{color:#fff}
.foot .fine{color:var(--on-black-dim)}

@media (max-width:960px){
  .hero{grid-template-columns:1fr;min-height:0}
  .hero-art{order:-1;display:flex;gap:2px;overflow-x:auto;min-height:0;scroll-snap-type:x mandatory;scrollbar-width:none}
  .hero-art .f{flex:none;width:44vw;aspect-ratio:4/5;scroll-snap-align:start}
  .hero-art .f0{width:44vw}
  .hero-art.one .f{width:100%;aspect-ratio:4/3}
  .hero-copy{padding-top:28px;padding-bottom:36px}
  .lend-grid,.y-grid,.pdp{grid-template-columns:1fr}
  .tl{grid-auto-flow:row;grid-auto-columns:auto;gap:0;border-left:1px solid var(--ink);margin-left:6px}
  .tl li{border-top:0;padding:0 0 26px 26px}
  .tl li i{top:4px;left:-7px}
  .cols{grid-template-columns:1fr}
  .cols>div+div{padding-left:0;border-left:0;border-top:1px solid var(--line)}
  .info{position:static}
  .pdp-page{padding-bottom:84px}
  .buybar{display:flex;align-items:center;justify-content:space-between;gap:12px;position:fixed;left:0;right:0;bottom:0;z-index:15;padding:10px var(--gut) calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--ink);font-size:14px;color:var(--ink-2)}
  .buybar b{font-size:22px;color:var(--ink);margin-right:4px}
  .buybar .btn.rent{width:auto;min-height:50px}
  .gallery{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 calc(-1*var(--gut));scrollbar-width:none}
  .zoom{flex:none;width:86vw;scroll-snap-align:center}
  .lb-prev,.lb-next{display:none!important}
  .rail{grid-auto-columns:46vw}
  .cities-rail{grid-auto-columns:58vw}
  .filters{flex-wrap:nowrap;overflow-x:auto;margin:0 calc(-1*var(--gut)) 18px;padding:10px var(--gut);scrollbar-width:none}
  .filters button{flex:none}
  .filters .count{display:none}
  .note{font-size:16px}
}
@media (max-width:560px){
  .top{gap:8px;height:60px}
  .filters{top:60px}
  .logo img{width:104px}
  .city{padding:0 10px;letter-spacing:.06em;max-width:42vw}
  .city span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .top nav a{padding:0 11px;letter-spacing:.06em;font-size:11px}
  .hero-foot{flex-direction:column;gap:8px}
  .info dl div{grid-template-columns:120px 1fr}
  .bars th{width:52%;font-size:14px}
}
@media (prefers-reduced-motion:reduce){*,*::before{animation:none!important;transition:none!important}}
`;

/** The only client code: filters, the stylist box, the placeholder, the calculator. No framework. */
export const CLIENT = `
(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const grid=$('#grid');
if(grid){
  const apply=()=>{
    const sz=$$('.f-size[aria-pressed=true]').map(b=>b.dataset.v),h=$$('.f-h[aria-pressed=true]').map(b=>b.dataset.v);
    let n=0;
    for(const c of $$('.card',grid)){
      const sizes=c.dataset.size.split(','),ok=(!sz.length||sz.some(s=>sizes.includes(s)))&&(!h.length||h.includes(c.dataset.h));
      c.hidden=!ok;if(ok)n++;
    }
    $('.filters .count').textContent=n+(n===1?' peça':' peças');
    $('.near .empty').hidden=n>0;
  };
  $$('.filters button').forEach(b=>b.onclick=()=>{b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')!=='true');apply()});
}
const form=$('.ask'),box=$('#busca');
if(form&&box){
  const input=$('#q'),ph=JSON.parse(input.dataset.ph||'[]');let k=0;
  const tick=setInterval(()=>{if(document.activeElement===input||input.value)return;k=(k+1)%ph.length;input.placeholder='Conte a ocasião: '+ph[k]},3200);
  const city=form.cidade.value;
  let seq=0;
  const run=async q=>{
    q=q.trim();if(!q)return;const my=++seq;
    clearInterval(tick);input.value=q;
    const u=new URL(location.href);u.searchParams.set('q',q);history.replaceState(null,'',u);
    box.hidden=false;
    box.innerHTML='<p class="k"><i></i>Personal stylist</p><h2 class="hb">'+q.replace(/[<&]/g,'')+'</h2><p class="thinking">Procurando nos closets…</p><div class="skel">'+'<i></i>'.repeat(8)+'</div>';
    box.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    try{
      const r=await fetch('/api/busca?q='+encodeURIComponent(q)+'&cidade='+city);
      if(my!==seq)return;
      if(r.status===429){box.querySelector('.thinking').textContent='Muitas buscas seguidas. Tenta de novo em um minuto?';return}
      box.innerHTML=await r.text();
      const a=$('.again',box);if(a)a.onclick=()=>{scrollTo({top:0,behavior:'smooth'});input.select();input.focus({preventScroll:true})};
      const x=$('.close',box);if(x)x.onclick=()=>{box.hidden=true;const u=new URL(location.href);u.searchParams.delete('q');history.replaceState(null,'',u)};
      const note=$('.note .tx',box);
      if(note){const n=await fetch('/api/nota?q='+encodeURIComponent(q)+'&cidade='+city).then(r=>r.ok?r.text():'').catch(()=>'');if(my!==seq)return;if(n)note.textContent=n;else note.parentElement.remove()}
    }catch{const t=box.querySelector('.thinking');if(t)t.textContent='Não consegui buscar agora. Tenta de novo?'}
  };
  form.onsubmit=e=>{e.preventDefault();run(input.value)};
  $$('.chips button').forEach(b=>b.onclick=()=>run(b.dataset.q));
  const q0=new URL(location.href).searchParams.get('q');if(q0)run(q0);
}
for(const c of $$('.calc')){
  const r=+c.dataset.ratio,inp=$('input',c),f=v=>'R$ '+Math.round(v).toLocaleString('pt-BR');
  const up=()=>{const v=+inp.value;$('.worth',c).textContent=f(v);$('.rent',c).textContent=f(v*r);$('.times',c).textContent=Math.ceil(1/r)};
  inp.oninput=up;up();
}
const lb=$('.lightbox');
if(lb){
  const tr=$('.lb-track',lb),n=tr.children.length,at=()=>Math.round(tr.scrollLeft/tr.clientWidth);
  const go=i=>tr.scrollTo({left:Math.max(0,Math.min(n-1,i))*tr.clientWidth,behavior:'smooth'});
  $$('.zoom').forEach(b=>b.onclick=()=>{lb.showModal();tr.scrollLeft=+b.dataset.i*tr.clientWidth});
  tr.onscroll=()=>{$('.lb-n',lb).textContent=(at()+1)+' / '+n};
  $('.lb-x',lb).onclick=()=>lb.close();
  $('.lb-prev',lb).onclick=()=>go(at()-1);$('.lb-next',lb).onclick=()=>go(at()+1);
  lb.addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(at()+1);if(e.key==='ArrowLeft')go(at()-1)});
  lb.addEventListener('close',()=>$$('.zoom')[at()]?.focus());
}
const pop=$('#cities');if(pop)pop.addEventListener('toggle',e=>{if(e.newState==='open')$('a[aria-current]',pop)?.focus()});
})();
`;

export function resultsFragment(q: string, picks: Piece[], ctx: Ctx, fallback: boolean): string {
  const head = `${kick("Personal stylist")}<h2 class="hb">${esc(q)}`;
  if (!picks.length)
    return `${head}<span class="dim">Nada combinou de verdade.</span></h2><p class="meta-line">Tenta descrever a ocasião, a cor ou o clima da festa · <button class="close" type="button">fechar</button></p>`;
  const near = ctx.hub ? picks.filter((p) => p.hub === ctx.hub!.city).length : 0;
  return `${head}<span class="dim">${picks.length} peças${ctx.hub && near ? `, ${near} em ${esc(ctx.hub.city)}` : ""}.</span></h2>
<p class="meta-line">${fallback ? "Busca simples, a stylist está fora do ar · " : ""}<button class="again" type="button">Nova busca</button> · <button class="close" type="button">Fechar</button></p>
${fallback ? "" : '<div class="note"><span class="by">Nina · stylist da Circulei</span><span class="tx"></span></div>'}
<div class="grid">${picks.map((p, i) => card(p, ctx, i)).join("")}</div>`;
}
