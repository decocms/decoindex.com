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

const brl = (cents: number) => `R$\u00a0${Math.round(cents / 100).toLocaleString("pt-BR")}`;
const img = (u: string, w: number) => `${u}${u.includes("?") ? "&" : "?"}width=${w}`;
const srcset = (u: string) => [360, 540, 800, 1100].map((w) => `${img(u, w)} ${w}w`).join(", ");
const SHOP = "https://www.circulei.co";
export const outbound = (handle: string) => `${SHOP}/products/${encodeURIComponent(handle)}?ref=decoindex`;
const LENDER_FORM = "https://aporte-sua-peca.circulei.co/";
const WHATSAPP = "https://wa.me/message/NFYDMJGPIXVEI1";

/** "motoboy" when the piece is in the city being shown; otherwise it ships. */
function reach(p: Piece, ctx: Ctx): { near: boolean; label: string } {
  if (ctx.hub && p.hub === ctx.hub.city) return { near: true, label: p.city === ctx.hub.city ? "na sua cidade" : `${p.city} · pertinho` };
  const pt = pointOf(p.city);
  const d = ctx.here && pt ? km(ctx.here, pt) : null;
  return { near: false, label: d !== null && d < 60 ? "pertinho" : `${p.city} · envio` };
}

const heightBand = (h?: number) => (!h ? "" : h < 1.6 ? "a" : h < 1.65 ? "b" : h < 1.7 ? "c" : "d");

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

function head(title: string, desc: string, image?: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex"><meta name="theme-color" content="#1b2a8f">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${image ? `<meta property="og:image" content="${esc(img(image, 1200))}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://cdn.shopify.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;1,6..96,500;1,6..96,600&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="none" stroke="#2a3fd1" stroke-width="5"/></svg>')}">
<style>${CSS}</style></head>`;
}

function header(ctx: Ctx, path = "/"): string {
  const label = ctx.hub ? ctx.hub.city : "Brasil todo";
  const where = ctx.here?.city && ctx.hub && ctx.here.city !== ctx.hub.city && !ctx.chosen ? `Você está em ${ctx.here.city}. ` : "";
  const hubs = ctx.snap.hubs
    .map((h) => {
      const d = ctx.here ? Math.round(km(ctx.here, h)) : null;
      return `<a href="${path}?cidade=${h.slug}" ${ctx.hub?.slug === h.slug ? 'aria-current="true"' : ""}><span>${esc(h.city)} <small>${esc(h.uf)}</small></span><span class="n">${h.count} peças${d !== null ? ` · ${d < 30 ? "aqui" : `${d.toLocaleString("pt-BR")} km`}` : ""}</span></a>`;
    })
    .join("");
  return `<header class="top">
  <a class="logo" href="/" aria-label="Circulei, início">circulei<span class="dot" aria-hidden="true"></span></a>
  <button class="city" popovertarget="cities" aria-label="Cidade: ${esc(label)}. Trocar">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>
    <span>${esc(label)}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  <nav><a href="/seja-locadora" class="lend">Seja locadora</a></nav>
  <div id="cities" popover class="cities">
    <p class="hint">${where}Mostramos primeiro as peças da cidade mais perto de você. Tudo também chega por envio, pra todo o Brasil.</p>
    ${hubs}
    <a href="${path}?cidade=brasil" ${ctx.hub ? "" : 'aria-current="true"'}><span>Brasil todo</span><span class="n">${ctx.snap.pieces.length} peças</span></a>
  </div>
</header>`;
}

const footer = `<footer class="foot">
  <div class="wrap">
    <a class="logo" href="/">circulei<span class="dot" aria-hidden="true"></span></a>
    <p>Moda é ativo. Seu closet é patrimônio.</p>
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
function occasions(): string[] {
  const m = new Date().getUTCMonth();
  const season = m >= 9 || m <= 0 ? ["formatura à noite", "festa de fim de ano", "réveillon na praia"] : m <= 3 ? ["carnaval", "casamento de dia"] : ["festa junina chique", "casamento no inverno"];
  return [...season, "madrinha de casamento", "noiva no civil", "convidada de casamento no campo", "jantar de aniversário"];
}

const isBag = (p: Piece) => /^(bolsa|clutch)/i.test(p.title);
/** Clothes before bags; worn photos (the owner states her height) before flat ones. */
const showcase = (ps: Piece[]) =>
  [...ps].sort((a, b) => +isBag(a) - +isBag(b) || +!!b.height - +!!a.height || b.images.length - a.images.length);

export function home(ctx: Ctx): string {
  const { snap, hub } = ctx;
  const local = showcase(hub ? snap.pieces.filter((p) => p.hub === hub.city) : snap.pieces);
  const away = showcase(hub ? snap.pieces.filter((p) => p.hub !== hub.city) : []);
  // Hero shows the most photogenic: pieces with several photos and a stated height lead.
  const dresses = local.filter((p) => /^vestido/i.test(p.title));
  // Hero: dresses only, worn (a stated height means the owner is in the photo), the most photographed first.
  const heroPicks = [...(dresses.length >= 5 ? dresses : local)].sort((a, b) => (b.height ? 1 : 0) - (a.height ? 1 : 0) || b.images.length - a.images.length || b.daily - a.daily).slice(0, 5);
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
    <h1>Alugue roupas incríveis <em>perto de você.</em></h1>
    <p class="lede">${local.length} peças nos closets de ${esc(place)} agora, vestidos a partir de <b>${brl(fromRent)}</b> por 4 dias.${hub ? " Na mesma cidade, a entrega é por motoboy." : ""}</p>
    <label class="ask-label" for="q">O que você vai celebrar?</label>
    <form class="ask" action="/" role="search">
      <input id="q" name="q" autocomplete="off" enterkeyhint="search" placeholder="Ex.: ${esc(occ[0])}" data-ph='${esc(JSON.stringify(occ))}'>
      <input type="hidden" name="cidade" value="${esc(hub?.slug ?? "brasil")}">
      <button aria-label="Buscar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </form>
    <div class="chips" aria-label="Ocasiões">${occ.slice(0, 5).map((o) => `<button type="button" data-q="${esc(o)}">${esc(o)}</button>`).join("")}</div>
  </div>
  <div class="hero-art" aria-label="Peças em ${esc(place)}">
    ${heroPicks.map((p, i) => `<a href="/p/${esc(p.handle)}" class="f f${i}"><img src="${esc(img(p.images[0]!, i === 0 ? 800 : 540))}" alt="${esc(p.title)}" ${i < 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"><span>${esc(p.brand)} · ${brl(p.daily * 4)}</span></a>`).join("")}
  </div>
</section>

<section id="busca" class="results" hidden aria-live="polite"></section>

<section class="near wrap" id="perto">
  <div class="sec-head">
    <h2>${hub ? `Nos closets de ${esc(hub.city)}` : "Nos closets do Brasil"}</h2>
    <p>${hub ? "Peças que estão na sua cidade: dá pra provar, combinar a entrega e devolver sem frete longo." : "Escolha uma cidade no topo pra ver primeiro o que está perto."}</p>
  </div>
  <div class="filters" role="group" aria-label="Filtrar">
    <span class="fl">Tamanho</span>${sizes.map((s) => `<button type="button" class="f-size" aria-pressed="false" data-v="${s}">${s}</button>`).join("")}
    <span class="fl">Sua altura</span>${[["a", "até 1,59"], ["b", "1,60–1,64"], ["c", "1,65–1,69"], ["d", "1,70+"]].map(([v, l]) => `<button type="button" class="f-h" aria-pressed="false" data-v="${v}">${l}</button>`).join("")}
    <output class="count" aria-live="polite">${local.length} peças</output>
  </div>
  <div class="grid" id="grid">${local.map((p, i) => card(p, ctx, i, p.city !== hub?.city)).join("")}</div>
  <p class="empty" hidden>Nenhuma peça com esse filtro aqui. <a href="/?cidade=brasil#perto">Ver o Brasil todo</a> — tudo chega por envio.</p>
</section>

${away.length ? `<section class="away">
  <div class="wrap sec-head"><h2>De outros closets, pra você</h2><p>Enviamos pra todo o Brasil. ${away.length} peças em ${new Set(away.map((p) => p.city)).size} cidades.</p></div>
  <div class="rail">${away.slice(0, 16).map((p, i) => card(p, ctx, i + 8)).join("")}<a class="more" href="/?cidade=brasil#perto">Ver todas<br>as ${snap.pieces.length} peças</a></div>
</section>` : ""}

<section class="lend-cta">
  <div class="wrap lend-grid">
    <div>
      <h2>Seu closet <em>rende.</em></h2>
      <p>Aquele vestido que você usou duas vezes pode circular. Você aporta a peça, a Circulei cuida da vitrine, da curadoria e da conversa com quem aluga, e você recebe a cada aluguel.</p>
      <a class="btn ink" href="/seja-locadora">Quero ser locadora</a>
    </div>
    ${calculator(snap)}
  </div>
</section>

<section class="how wrap">
  <h2>Como funciona</h2>
  <ol>
    <li><b>Escolha perto de você.</b> Veja tamanho, medidas da dona e onde a peça está. Muitas aceitam prova.</li>
    <li><b>Reserve 4 dias.</b> Escolha as datas no calendário da peça, na Circulei.</li>
    <li><b>Receba, brilhe, devolva.</b> Motoboy na mesma cidade, envio para o resto do Brasil.</li>
  </ol>
</section>
</main>
${footer}
<script>${CLIENT}</script>
</body></html>`;
}

function calculator(snap: Snapshot): string {
  const pct = Math.round(snap.rentRatio * 100);
  return `<div class="calc" data-ratio="${snap.rentRatio}">
  <label for="worth">Quanto custou sua peça?</label>
  <output class="worth" for="worth">R$ 1.500</output>
  <input id="worth" type="range" min="400" max="8000" step="100" value="1500">
  <p class="res">Peças assim alugam por cerca de <b class="rent">${brl(150000 * snap.rentRatio)}</b> por 4 dias.<br>Em <b class="times">${Math.ceil(1 / snap.rentRatio)}</b> aluguéis, o valor da peça já circulou de volta.</p>
  <p class="fine">Estimativa a partir do catálogo atual: o aluguel de 4 dias fica em torno de ${pct}% do preço da peça. Você define seu preço com a Circulei.</p>
</div>`;
}

export function pdp(ctx: Ctx, p: Piece, similar: Piece[]): string {
  const pt = pointOf(p.city);
  const d = ctx.here && pt ? Math.round(km(ctx.here, pt)) : null;
  const near = ctx.hub && p.hub === ctx.hub.city;
  const facts: [string, string][] = [
    ["Tamanho", [p.size, p.fits && `serve ${p.fits}`].filter(Boolean).join(" · ")],
    ["Veste este corpo", [p.height && `${p.height.toFixed(2).replace(".", ",")} m`, p.body].filter(Boolean).join(" · ")],
    ["Prova", p.prova === undefined ? "" : p.prova ? "aceita prova" : "não aceita prova"],
    ["Ajustes", p.ajuste === undefined ? "" : p.ajuste ? "permite ajustes, combinados com a Circulei" : "não permite ajustes"],
  ];
  return `${head(`${p.title} · ${p.brand} · Circulei`, `Alugue ${p.title} (${p.brand}) por ${brl(p.daily * 4)} por 4 dias. Do closet de ${p.owner}, ${p.city}.`, p.images[0])}
<body class="pdp-page">
${header(ctx, `/p/${p.handle}`)}
<main class="pdp wrap">
  <div class="gallery" tabindex="0" aria-label="Fotos">${p.images.map((u, i) => `<img src="${esc(img(u, 900))}" srcset="${esc(srcset(u))}" sizes="(min-width: 900px) 50vw, 92vw" alt="${esc(p.title)}, foto ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">`).join("")}</div>
  <div class="info">
    <p class="brand">${esc(p.brand)}</p>
    <h1>${esc(p.title)}</h1>
    <p class="price"><b>${brl(p.daily * 4)}</b> por 4 dias <span>· ${brl(p.daily)} por dia${p.retail ? ` · peça de ${brl(p.retail)}` : ""}</span></p>
    <p class="where${near ? " near" : ""}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>
      <span>Do closet de <b>${esc(p.owner)}</b>, ${esc(p.city)}, ${esc(p.uf)}${d !== null ? ` · ${d < 30 ? "na sua cidade" : `a ${d.toLocaleString("pt-BR")} km de você`}` : ""}.
      <small>${near || (d !== null && d < 60) ? "Entrega por motoboy." : "Enviamos pra você."}</small></span>
    </p>
    <dl>${facts.filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    <a class="btn rent" href="${esc(outbound(p.handle))}">Escolher datas na Circulei</a>
    <p class="fine">Reserva, pagamento e entrega acontecem em circulei.co.</p>
  </div>
</main>
<div class="buybar"><span><b>${brl(p.daily * 4)}</b> · 4 dias</span><a class="btn rent" href="${esc(outbound(p.handle))}">Escolher datas</a></div>
${similar.length ? `<section class="wrap similar"><h2>Combina com você também</h2><div class="grid">${similar.map((s, i) => card(s, ctx, i)).join("")}</div></section>` : ""}
${footer}
<script>${CLIENT}</script>
</body></html>`;
}

export function lender(ctx: Ctx): string {
  const { snap } = ctx;
  const max = Math.max(...snap.cities.map((c) => c.count));
  // Every city with a closet, set in type sized by how many pieces it holds.
  const flow = snap.cities
    .map((c, i) => `<span class="${i < 3 ? "big" : ""}" style="--s:${(0.9 + 2.2 * Math.sqrt(c.count / max)).toFixed(2)}">${esc(c.city)}<sup>${c.count}</sup></span>`)
    .join(" ");
  const owners = new Set(snap.pieces.map((p) => `${p.owner}|${p.city}`)).size;
  const brands = [...new Set(snap.pieces.map((p) => p.brand).filter((b) => b && !/circulei|sob medida/i.test(b)))].slice(0, 14);
  return `${head("Seja locadora · Circulei", "Seu closet é patrimônio. Aporte suas peças na Circulei e receba a cada aluguel.")}
<body class="lender-page">
${header(ctx, "/seja-locadora")}
<main>
<section class="l-hero">
  <div class="wrap l-grid">
    <div>
      <h1>Seu closet é <em>patrimônio.</em></h1>
      <p class="lede">Peças paradas no armário não rendem nada. Na Circulei, elas circulam entre mulheres de ${snap.cities.length} cidades e voltam pra você como renda, aluguel após aluguel.</p>
      <div class="l-actions"><a class="btn ink" href="${LENDER_FORM}">Aportar minhas peças</a><a class="btn ghost" href="${WHATSAPP}">Conversar no WhatsApp</a></div>
    </div>
    <figure class="map">
      <p class="flow" aria-label="Cidades com closets na Circulei e quantas peças cada uma tem">${flow}</p>
      <figcaption>${owners} closets em ${snap.cities.length} cidades, hoje.</figcaption>
    </figure>
  </div>
</section>

<section class="wrap benefits">
  <h2>Por que aportar</h2>
  <div class="b-list">
    <div><h3>Renda a cada aluguel</h3><p>Cada vez que alguém aluga sua peça, parte do valor volta pra você. O vestido de uma festa vira vários meses de retorno.</p></div>
    <div><h3>Você decide as regras</h3><p>Se a peça aceita prova, se permite ajustes, qual o tamanho que ela veste. Tudo aparece pra quem aluga, com as suas medidas.</p></div>
    <div><h3>A Circulei faz a ponte</h3><p>Vitrine, curadoria e a conversa com quem aluga ficam com a gente. Na mesma cidade, a entrega é por motoboy.</p></div>
    <div><h3>Preço com dados</h3><p>A gente sabe o que aluga e por quanto. Você define o valor com uma sugestão baseada no catálogo real.</p></div>
  </div>
</section>

<section class="lend-cta">
  <div class="wrap lend-grid">
    <div><h2>Quanto sua peça <em>rende?</em></h2><p>Mexa no valor da peça e veja quanto peças parecidas alugam hoje na Circulei.</p></div>
    ${calculator(snap)}
  </div>
</section>

<section class="wrap brands">
  <h2>Já circulam por aqui</h2>
  <p class="brand-list">${brands.map(esc).join("<span aria-hidden=\"true\"> · </span>")}</p>
</section>

<section class="wrap how">
  <h2>Como aportar</h2>
  <ol>
    <li><b>Mande suas peças.</b> Fotos e medidas pelo formulário. A curadoria responde se elas entram.</li>
    <li><b>Combine o preço.</b> Com sugestão a partir do que já aluga na Circulei.</li>
    <li><b>Receba a cada aluguel.</b> Sua peça aparece pra quem está perto e pra todo o Brasil.</li>
  </ol>
  <a class="btn ink" href="${LENDER_FORM}">Aportar minhas peças</a>
  <p class="fine"><a href="${SHOP}/pages/criterios-de-curadoria">Critérios de curadoria</a> · <a href="${SHOP}/pages/para-aportar-pecas">Como funciona para aportar</a></p>
</section>
</main>
${footer}
<script>${CLIENT}</script>
</body></html>`;
}

export function notFound(ctx: Ctx): string {
  return `${head("Circulei", "Página não encontrada")}<body>${header(ctx)}<main class="wrap nf"><h1>Essa peça já <em>circulou.</em></h1><p>Ela pode ter sido alugada ou saído do acervo.</p><a class="btn ink" href="/">Ver o que está perto de você</a></main>${footer}<script>${CLIENT}</script></body></html>`;
}

const CSS = `
:root{
  --ink:oklch(0.22 0.04 264);--ink-2:oklch(0.42 0.04 264);--bg:oklch(1 0 0);--mist:oklch(0.965 0.01 264);--line:oklch(0.9 0.015 264);
  --cobalt:oklch(0.46 0.21 266);--cobalt-deep:oklch(0.3 0.16 266);--pink:oklch(0.66 0.24 356);--sun:oklch(0.9 0.17 100);--sun-ink:oklch(0.3 0.08 90);
  --serif:"Bodoni Moda",ui-serif,Georgia,serif;--sans:Figtree,ui-sans-serif,system-ui,sans-serif;
  --gut:clamp(16px,4vw,48px);--ease:cubic-bezier(.22,1,.36,1);
  color-scheme:light;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:400 16px/1.55 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{display:block;max-width:100%}
a{color:inherit}
h1,h2,h3{text-wrap:balance;margin:0}
p{text-wrap:pretty}
em{font-family:var(--serif);font-style:italic;font-weight:500}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.wrap{max-width:1320px;margin:0 auto;padding:0 var(--gut)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 26px;border-radius:999px;font:600 15px var(--sans);text-decoration:none;border:0;cursor:pointer;transition:transform .3s var(--ease),background .2s}
.btn:active{transform:scale(.98)}
.btn.ink{background:var(--ink);color:#fff}.btn.ink:hover{background:var(--cobalt)}
.btn.ghost{border:1.5px solid currentColor}
.fine{font-size:13px;color:var(--ink-2)}

/* header */
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:12px var(--gut);background:color-mix(in oklch,var(--cobalt-deep) 96%,transparent);color:#fff;backdrop-filter:saturate(1.4) blur(10px)}
.logo{font:600 26px/1 var(--serif);font-style:italic;letter-spacing:-.01em;text-decoration:none;display:inline-flex;align-items:flex-start}
.logo .dot{width:7px;height:7px;border-radius:50%;background:var(--pink);margin:3px 0 0 2px}
.city{display:inline-flex;align-items:center;gap:6px;margin-left:auto;height:38px;padding:0 12px 0 10px;border-radius:999px;border:1px solid color-mix(in oklch,#fff 30%,transparent);background:transparent;color:inherit;font:600 14px var(--sans);cursor:pointer}
.city:hover{background:color-mix(in oklch,#fff 12%,transparent)}
.city svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
.city .chev{width:14px;height:14px;opacity:.7}
.top nav a{font:600 14px var(--sans);text-decoration:none;padding:9px 14px;border-radius:999px;background:var(--sun);color:var(--sun-ink);white-space:nowrap}
.cities{margin:0;inset:auto;top:64px;right:var(--gut);left:auto;position:fixed;width:min(360px,calc(100vw - 2*var(--gut)));max-height:min(70vh,560px);overflow:auto;padding:10px;border:0;border-radius:18px;background:#fff;color:var(--ink);box-shadow:0 24px 60px -12px oklch(0.2 0.1 266/.35)}
.cities .hint{margin:6px 10px 10px;font-size:13px;color:var(--ink-2)}
.cities a{display:flex;justify-content:space-between;gap:12px;padding:11px 12px;border-radius:12px;text-decoration:none;font-weight:600}
.cities a:hover{background:var(--mist)}
.cities a[aria-current]{background:var(--cobalt);color:#fff}
.cities a[aria-current] .n{color:#fff}
.cities small{font-weight:500;opacity:.6}
.cities .n{font-weight:500;color:var(--ink-2);font-size:14px}

/* hero */
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:clamp(24px,4vw,64px);align-items:center;padding:clamp(28px,5vw,72px) var(--gut) clamp(40px,6vw,88px);background:var(--cobalt-deep);color:#fff;overflow:hidden}
.hero h1{font:500 clamp(2.6rem,6.2vw,5.6rem)/.98 var(--sans);letter-spacing:-.035em}
.hero h1 em{display:block;color:var(--sun);letter-spacing:-.02em;font-size:1.04em}
.lede{font-size:clamp(17px,1.5vw,20px);max-width:44ch;margin:22px 0 28px;color:color-mix(in oklch,#fff 86%,var(--cobalt))}
.hero .lede b{color:#fff}
.ask-label{display:block;font:600 15px var(--sans);margin:0 0 10px 4px;color:var(--sun)}
.ask{display:flex;align-items:center;max-width:560px;background:#fff;border-radius:999px;padding:6px 6px 6px 22px;box-shadow:0 18px 50px -18px oklch(0.1 0.1 266/.6)}
.ask input{flex:1;min-width:0;border:0;outline:0;font:500 17px var(--sans);color:var(--ink);background:transparent;height:48px}
.ask input::placeholder{color:var(--ink-2)}
.ask button{flex:none;width:48px;height:48px;border-radius:50%;border:0;background:var(--pink);color:#fff;cursor:pointer;display:grid;place-items:center;transition:transform .3s var(--ease)}
.ask button:hover{transform:translateX(2px)}
.ask button svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}
.ask:focus-within{box-shadow:0 0 0 3px var(--sun),0 18px 50px -18px oklch(0.1 0.1 266/.6)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;max-width:600px}
.chips button{font:500 14px var(--sans);color:#fff;background:color-mix(in oklch,#fff 10%,transparent);border:1px solid color-mix(in oklch,#fff 22%,transparent);border-radius:999px;padding:8px 14px;cursor:pointer;transition:background .2s}
.chips button:hover{background:color-mix(in oklch,#fff 22%,transparent)}
.hero-art{position:relative;display:grid;grid-template-columns:1.25fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:12px;height:clamp(380px,46vw,620px)}
.hero-art .f{position:relative;border-radius:20px;overflow:hidden;background:var(--cobalt);text-decoration:none;animation:rise .9s var(--ease) backwards}
.hero-art .f img{width:100%;height:100%;object-fit:cover;transition:transform 1.2s var(--ease)}
.hero-art .f:hover img{transform:scale(1.04)}
.hero-art .f span{position:absolute;left:10px;bottom:10px;font:600 12px var(--sans);background:#fff;color:var(--ink);padding:5px 10px;border-radius:999px}
.f0{grid-row:1/3}.f1{animation-delay:.08s!important}.f2{animation-delay:.16s!important;transform:translateY(28px)}.f3{animation-delay:.24s!important}.f4{animation-delay:.32s!important;transform:translateY(28px)}
@keyframes rise{from{opacity:0;translate:0 24px}}

/* sections */
section{scroll-margin-top:72px}
.sec-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 32px;margin:clamp(48px,7vw,96px) 0 20px}
.sec-head h2,.how h2,.similar h2,.benefits h2,.brands h2{font:500 clamp(1.8rem,3.4vw,2.8rem)/1.05 var(--sans);letter-spacing:-.03em}
.sec-head p{margin:0;max-width:52ch;color:var(--ink-2)}
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 0 18px;position:sticky;top:62px;z-index:5;background:var(--bg)}
.filters .fl{font:600 13px var(--sans);color:var(--ink-2);margin:0 2px 0 8px}.filters .fl:first-child{margin-left:0}
.filters button{min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:#fff;font:500 14px var(--sans);color:var(--ink);cursor:pointer}
.filters button:hover{border-color:var(--ink)}
.filters button[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff}
.filters .count{margin-left:auto;font:500 14px var(--sans);color:var(--ink-2)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,44vw),1fr));gap:clamp(12px,2vw,28px) clamp(10px,1.6vw,22px)}
.card{text-decoration:none;display:block;animation:rise .7s var(--ease) backwards;animation-delay:calc(var(--i)*40ms)}
.ph{position:relative;display:block;aspect-ratio:3/4;border-radius:16px;overflow:hidden;background:var(--mist)}
.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .5s var(--ease),transform 1s var(--ease)}
.ph .alt{opacity:0}
@media (hover:hover){.card:hover .ph .alt{opacity:1}.card:hover .ph img{transform:scale(1.03)}}
.tag{position:absolute;top:10px;left:10px;font:600 12px var(--sans);padding:5px 10px;border-radius:999px;background:#fff;color:var(--ink)}
.tag.near{background:var(--sun);color:var(--sun-ink)}
.meta{display:grid;gap:2px;padding:10px 2px 0}
.brand{font:600 12px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--cobalt)}
.title{font-size:15px;line-height:1.3}
.row{display:flex;align-items:baseline;gap:6px;font-size:14px;color:var(--ink-2)}
.row b{color:var(--ink);font-weight:700}
.row .size{margin-left:auto;font-weight:600;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:0 6px;font-size:12px}
.card[hidden]{display:none}
.empty{padding:32px 0;color:var(--ink-2)}

.away{background:var(--mist);padding-bottom:clamp(40px,5vw,72px);margin-top:clamp(48px,7vw,96px)}
.away .sec-head{padding-top:clamp(40px,5vw,64px);margin-top:0}
.rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(200px,22vw);gap:16px;overflow-x:auto;padding:0 max(var(--gut),calc((100vw - 1320px)/2 + var(--gut))) 8px;scroll-padding-inline:max(var(--gut),calc((100vw - 1320px)/2 + var(--gut)));scroll-snap-type:x mandatory;scrollbar-width:thin}
.rail .card{scroll-snap-align:start}
.rail .more{display:grid;place-items:center;text-align:center;aspect-ratio:3/4;border-radius:16px;background:var(--ink);color:#fff;font:500 20px/1.2 var(--sans);text-decoration:none}

/* results */
.results{padding:clamp(32px,4vw,56px) var(--gut) 0;max-width:1320px;margin:0 auto}
.results h2{font:500 clamp(1.6rem,3vw,2.4rem)/1.1 var(--sans);letter-spacing:-.03em}
.results h2 em{color:var(--cobalt)}
.note{font:500 clamp(18px,1.6vw,21px)/1.5 var(--serif);font-style:italic;max-width:64ch;margin:14px 0 26px;color:var(--ink);min-height:1.5em}
.note:empty::before{content:"A curadora está olhando as peças…";color:var(--ink-2)}
.results .kick{margin:0 0 4px;font:600 15px var(--sans);color:var(--ink-2)}
.results .again,.results .close{font:600 14px var(--sans);background:none;border:0;color:var(--ink-2);cursor:pointer;padding:8px 0;text-decoration:underline}
.skel{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,44vw),1fr));gap:20px}
.skel i{aspect-ratio:3/4;border-radius:16px;background:linear-gradient(100deg,var(--mist) 40%,#fff 50%,var(--mist) 60%) 0/300% 100%;animation:sh 1.2s linear infinite}
@keyframes sh{to{background-position:-150% 0}}
.thinking{display:flex;align-items:center;gap:10px;color:var(--ink-2);margin:12px 0 22px}
.thinking::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--pink);animation:pulse 1s var(--ease) infinite alternate}
@keyframes pulse{to{transform:scale(1.6);opacity:.4}}

/* lend */
.lend-cta{background:var(--sun);color:var(--sun-ink);margin-top:clamp(48px,7vw,96px);padding:clamp(48px,7vw,104px) 0}
.lend-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,80px);align-items:center}
.lend-cta h2{font:500 clamp(2.4rem,5.2vw,4.6rem)/1 var(--sans);letter-spacing:-.035em;color:var(--ink)}
.lend-cta h2 em{color:var(--pink)}
.lend-cta p{max-width:46ch;font-size:18px;margin:18px 0 28px}
.calc{background:#fff;color:var(--ink);border-radius:28px;padding:clamp(24px,3vw,40px);box-shadow:0 30px 60px -30px oklch(0.4 0.1 90/.5)}
.calc label{font:600 15px var(--sans);color:var(--ink-2)}
.calc .worth{display:block;font:500 clamp(2.4rem,4vw,3.4rem)/1.1 var(--sans);letter-spacing:-.03em;margin:4px 0 14px}
.calc input{width:100%;accent-color:var(--pink);height:28px}
.calc .res{font-size:17px;margin:18px 0 10px;color:var(--ink)}
.calc .res b{color:var(--cobalt)}
.calc .fine{margin:0}

.how{margin-top:clamp(56px,7vw,104px);margin-bottom:clamp(56px,7vw,104px)}
.how ol{list-style:none;counter-reset:s;padding:0;margin:28px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(16px,3vw,48px)}
.how li{counter-increment:s;font-size:17px;color:var(--ink-2);padding-top:18px;border-top:2px solid var(--ink)}
.how li::before{content:counter(s);display:block;font:500 44px/1 var(--serif);font-style:italic;color:var(--pink);margin-bottom:12px}
.how li b{display:block;color:var(--ink);font-size:19px;margin-bottom:4px}
.how .btn{margin-top:36px}

/* pdp */
.pdp{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:clamp(24px,4vw,64px);padding-top:clamp(20px,3vw,40px);align-items:start}
.gallery{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gallery img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:16px;background:var(--mist)}
.gallery img:first-child{grid-column:1/3}
.info{position:sticky;top:90px}
.info .brand{margin:0 0 8px}
.info h1{font:500 clamp(2rem,3.6vw,3.2rem)/1.02 var(--sans);letter-spacing:-.03em}
.price{font-size:18px;margin:16px 0}
.price b{font-size:26px}
.price span{color:var(--ink-2);font-size:15px}
.where{display:grid;grid-template-columns:18px 1fr;gap:10px;align-items:start;padding:14px 16px;border-radius:14px;background:var(--mist);font-size:15px}
.where.near{background:color-mix(in oklch,var(--sun) 55%,#fff)}
.where svg{width:18px;height:18px;margin-top:3px;fill:none;stroke:var(--cobalt);stroke-width:2}
.where small{display:block;font-size:14px;color:var(--ink-2);margin-top:2px}
.info dl{margin:20px 0;display:grid;gap:0}
.info dl div{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
.info dt{color:var(--ink-2);font-size:14px}.info dd{margin:0;font-weight:500}
.btn.rent{width:100%;background:var(--pink);color:#fff;font-size:16px;min-height:56px}
.btn.rent:hover{background:var(--cobalt)}
.buybar{display:none}
.similar{margin:clamp(56px,7vw,104px) auto}
.similar h2{margin-bottom:24px}

/* lender */
.l-hero{background:var(--cobalt-deep);color:#fff;padding:clamp(40px,6vw,96px) 0}
.l-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:clamp(24px,5vw,80px);align-items:center}
.l-hero h1{font:500 clamp(2.6rem,6vw,5.4rem)/.98 var(--sans);letter-spacing:-.035em}
.l-hero h1 em{color:var(--sun);display:block}
.l-actions{display:flex;flex-wrap:wrap;gap:12px}
.l-hero .btn.ink{background:var(--sun);color:var(--sun-ink)}
.l-hero .btn.ink:hover{background:#fff}
.map{margin:0}
.flow{margin:0;font:500 16px/1.15 var(--serif);font-style:italic;color:color-mix(in oklch,#fff 78%,var(--cobalt))}
.flow span{display:inline-block;font-size:calc(var(--s)*1em);margin:0 .28em .12em 0;animation:rise .8s var(--ease) backwards}
.flow span.big{color:var(--sun)}
.flow sup{font:600 .38em var(--sans);font-style:normal;color:var(--pink);margin-left:.15em;vertical-align:.9em}
.map figcaption{font-size:14px;color:color-mix(in oklch,#fff 80%,var(--cobalt));margin-top:8px}
.benefits{margin-top:clamp(56px,7vw,104px)}
.b-list{display:grid;grid-template-columns:repeat(2,1fr);gap:clamp(24px,4vw,56px) clamp(24px,5vw,80px);margin-top:32px}
.b-list h3{font:500 22px/1.2 var(--sans);letter-spacing:-.01em;margin-bottom:8px}
.b-list h3::before{content:"";display:block;width:28px;height:4px;border-radius:2px;background:var(--pink);margin-bottom:14px}
.b-list p{margin:0;color:var(--ink-2);max-width:48ch}
.brands{margin-top:clamp(56px,7vw,104px)}
.brand-list{font:500 clamp(22px,2.6vw,34px)/1.4 var(--serif);font-style:italic;margin-top:20px}
.brand-list span{color:var(--pink)}
.nf{min-height:60vh;padding-top:80px}.nf h1{font:500 clamp(2.4rem,5vw,4rem)/1 var(--sans);letter-spacing:-.03em}.nf h1 em{color:var(--pink)}

/* footer */
.foot{background:var(--ink);color:#fff;padding:56px 0 40px}
.foot p{max-width:60ch}
.foot nav{display:flex;flex-wrap:wrap;gap:8px 22px;margin:20px 0}
.foot nav a{text-decoration:none;color:color-mix(in oklch,#fff 80%,var(--ink))}
.foot nav a:hover{color:#fff}
.foot .fine{color:color-mix(in oklch,#fff 62%,var(--ink))}

@media (max-width:900px){
  .hero{grid-template-columns:1fr;padding-top:24px;gap:24px}
  .hero-art{order:-1;display:flex;height:auto;gap:10px;overflow-x:auto;margin:0 calc(-1*var(--gut));padding:0 var(--gut);scroll-snap-type:x mandatory;scrollbar-width:none}
  .hero-art .f{flex:none;width:42vw;aspect-ratio:3/4;scroll-snap-align:start;transform:none!important}
  .hero-art .f0{width:56vw}
  .lede{margin:14px 0 20px}
  .lend-grid,.l-grid,.pdp{grid-template-columns:1fr}
  .how ol{grid-template-columns:1fr}
  .b-list{grid-template-columns:1fr}
  .info{position:static}
  .pdp-page{padding-bottom:84px}
  .buybar{display:flex;align-items:center;justify-content:space-between;gap:12px;position:fixed;left:0;right:0;bottom:0;z-index:15;padding:12px var(--gut) calc(12px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -10px 30px -12px oklch(0.2 0.05 264/.25);font-size:15px}
  .buybar b{font-size:20px}
  .buybar .btn.rent{width:auto;min-height:48px}
  .note{font-size:17px}
  .gallery{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;margin:0 calc(-1*var(--gut));padding:0 var(--gut);gap:8px;scrollbar-width:none}
  .gallery img{flex:none;width:82vw;scroll-snap-align:center}
  .rail{grid-auto-columns:46vw}
  .filters{top:58px;flex-wrap:nowrap;overflow-x:auto;margin:0 calc(-1*var(--gut));padding:10px var(--gut);scrollbar-width:none}
  .filters button{flex:none}
  .filters .count{display:none}
}
@media (max-width:520px){
  .logo{font-size:23px}
  .top{gap:8px}
  .top nav a{padding:8px 11px;font-size:13px}
  .city{padding:0 10px 0 8px;font-size:13px;max-width:44vw}
  .city span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .info dl div{grid-template-columns:120px 1fr}
}
@media (prefers-reduced-motion:reduce){*,*::before{animation:none!important;transition:none!important}}
`;

/** The only client code: filters, the ask box, the placeholder, the calculator. No framework. */
const CLIENT = `
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
  const tick=setInterval(()=>{if(document.activeElement===input||input.value)return;k=(k+1)%ph.length;input.placeholder='Ex.: '+ph[k]},3200);
  const city=form.cidade.value;
  let seq=0;
  const run=async q=>{
    q=q.trim();if(!q)return;const my=++seq;
    clearInterval(tick);input.value=q;
    const u=new URL(location.href);u.searchParams.set('q',q);history.replaceState(null,'',u);
    box.hidden=false;
    box.innerHTML='<p class="kick">Separando peças para</p><h2><em>“'+q.replace(/[<&]/g,'')+'”</em></h2><p class="thinking">Procurando nos closets…</p><div class="skel">'+'<i></i>'.repeat(8)+'</div>';
    box.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    try{
      const r=await fetch('/api/busca?q='+encodeURIComponent(q)+'&cidade='+city);
      if(my!==seq)return;
      if(r.status===429){box.querySelector('.thinking').textContent='Muitas buscas seguidas. Tenta de novo em um minuto?';return}
      box.innerHTML=await r.text();
      const note=$('.note',box);
      if(note){const n=await fetch('/api/nota?q='+encodeURIComponent(q)+'&cidade='+city).then(r=>r.ok?r.text():'').catch(()=>'');if(my===seq)note.textContent=n||'';if(!n)note.remove()}
      const a=$('.again',box);if(a)a.onclick=()=>{scrollTo({top:0,behavior:'smooth'});input.select();input.focus({preventScroll:true})};
      const x=$('.close',box);if(x)x.onclick=()=>{box.hidden=true;const u=new URL(location.href);u.searchParams.delete('q');history.replaceState(null,'',u)};
    }catch{box.querySelector('.thinking').textContent='Não consegui buscar agora. Tenta de novo?'}
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
const pop=$('#cities');if(pop)pop.addEventListener('toggle',e=>{if(e.newState==='open')$('a[aria-current]',pop)?.focus()});
})();
`;

export function resultsFragment(q: string, picks: Piece[], ctx: Ctx, fallback: boolean): string {
  if (!picks.length)
    return `<p class="kick">Busquei por</p><h2><em>“${esc(q)}”</em></h2><p class="note">Não achei nada que combine de verdade. Tenta descrever a ocasião, a cor ou o clima da festa.</p><button class="close" type="button">Fechar busca</button>`;
  const near = ctx.hub ? picks.filter((p) => p.hub === ctx.hub!.city).length : 0;
  return `<p class="kick">Separei para</p><h2><em>“${esc(q)}”</em></h2>
<p class="fine">${picks.length} peças${ctx.hub && near ? `, ${near} em ${esc(ctx.hub.city)}` : ""}${fallback ? " · busca simples, a curadoria está fora do ar" : ""} · <button class="again" type="button">nova busca</button> · <button class="close" type="button">fechar</button></p>
${fallback ? "" : '<p class="note"></p>'}
<div class="grid">${picks.map((p, i) => card(p, ctx, i)).join("")}</div>`;
}
