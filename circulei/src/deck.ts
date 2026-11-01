import { ARROW, footer, head, kick, logo, timeline } from "./html";

/**
 * Circulei's pre-seed deck (Oct 2026) as a page: same words, same order, same
 * visual system, readable on a phone. Images were extracted from the PDF into
 * public/deck/. Unlisted and noindex, but anyone with the link can open it.
 */
const k = (n: string, t: string) => kick(`<b>${n}</b>&ensp;${t}`);
const ICON = {
  wallet: `<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="1"/><path d="M3 10h18M16 14h2"/></svg>`,
  bag: `<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>`,
  trend: `<svg viewBox="0 0 24 24"><path d="m4 16 5-5 4 4 7-7M15 8h5v5"/></svg>`,
  cash: `<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="1"/><circle cx="12" cy="12" r="2"/></svg>`,
  truck: `<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/></svg>`,
  loop: `<svg viewBox="0 0 24 24"><path d="M4 11a7 7 0 0 1 12-4l2 2M20 13a7 7 0 0 1-12 4l-2-2M18 5v4h-4M6 19v-4h4"/></svg>`,
  hand: `<svg viewBox="0 0 24 24"><path d="M3 14h4l4 3h5a2 2 0 0 0 0-4h-4M7 14l3-3h3"/><circle cx="17" cy="7" r="3"/></svg>`,
  bot: `<svg viewBox="0 0 24 24"><rect x="5" y="9" width="14" height="10" rx="2"/><path d="M12 5v4M9 14h.01M15 14h.01"/></svg>`,
  brain: `<svg viewBox="0 0 24 24"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3V4ZM13 8h4M13 12h6M13 16h4"/></svg>`,
  spark: `<svg viewBox="0 0 24 24"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6ZM19 3v4M17 5h4"/></svg>`,
  image: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><circle cx="9" cy="9" r="1.6"/><path d="m20 15-5-5L5 20"/></svg>`,
};
const ib = (svg: string, hot = false) => `<span class="ib${hot ? " hot" : ""}">${svg}</span>`;

const ANGELS: [string, string, string, string][] = [
  ["felipe", "Felipe Baulé", "CEO da Hubii", "Marketplace"],
  ["rodrigo", "Rodrigo Cava", "CPO da Estoca", "Logística"],
  ["ana", "Ana Zucato", "CEO da Noh", "Produto B2C"],
  ["camila", "Camila Couto", "Diretora jurídica da SuperSim", "Jurídico e compliance"],
  ["alexandre", "Alexandre Dubugras", "Fundador da Alude e da Akira ENEM", "Fundraising"],
  ["guilherme", "Guilherme Rodrigues", "Cofundador da deco", "AI p/ ecommerce"],
];

// R$ of each R$ 1.000 of GMV: [label, sub, from, to, kind]
const FALL: [string, string, number, number, string][] = [
  ["GMV", "o que a cliente paga", 0, 1000, "b"],
  ["Dona da peça", "repasse", 540, 1000, "g"],
  ["Receita", "da Circulei", 0, 540, "b"],
  ["Custos diretos", "logística, segurança, embalagem", 410, 540, "g"],
  ["Fica com a Circulei", "take efetivo", 0, 410, "o"],
];

export function deck(): string {
  return `${head("Circulei · A plataforma de investimento em moda", "O closet parado vira renda, e a peça vira ativo. Pré-seed, outubro de 2026.", "/deck/rack.jpg")}
<body class="deck">
<style>${CSS}</style>
<main>
<section class="hero d-cover">
  <div class="hero-copy">
    <a class="d-logo" href="/">${logo(true)}</a>
    ${kick("Moda como ativo")}
    <h1 class="hw">A plataforma de investimento em moda</h1>
    <p class="lede"><b>O closet parado vira renda,</b> e a peça vira ativo.</p>
    <div class="hero-foot"><span>Pré-seed</span><span>Outubro de 2026</span></div>
  </div>
  <div class="hero-art one"><span class="f f0"><img src="/deck/rack.jpg" alt="Arara com vestidos de seda e sapatos, contra uma cortina iluminada" fetchpriority="high"></span></div>
</section>

<section class="d-sec wrap">
  ${k("02", "O que fazemos")}
  <h2 class="hb">Toda mulher tem dinheiro parado no armário.<span class="dim">A Circulei faz ele render.</span></h2>
  <div class="cols">
    <div>${ib(ICON.wallet)}<div><p class="k2">Quem tem closet</p><b>Ganha renda com a peça parada.</b></div></div>
    <div>${ib(ICON.bag)}<div><p class="k2">Quem aluga</p><b>Veste a peça que quer por uma fração do preço.</b></div></div>
    <div>${ib(ICON.trend)}<div><p class="k2">Quem investe</p><b>Compra as peças que mais rendem, pelo veículo.</b></div></div>
  </div>
  <p class="tl-label">Como funciona</p>
  ${timeline([
    ["Cadastro", "A lender manda fotos e medidas pelo formulário."],
    ["Curadoria", "Só 1 em cada 3 peças entra, com preço por peças comparáveis."],
    ["Reserva", "A renter reserva com até cinco meses de antecedência e paga na hora."],
    ["Aluguel", "A peça viaja com nota fiscal do valor, pra todo o Brasil."],
    ["Repasse", "A lender recebe no mês seguinte e a peça volta a girar."],
  ])}
</section>

<section class="d-market">
  <div class="m-img"><img src="/deck/tecido.jpg" alt="Seda estampada e sapatos de salto sobre o piso de madeira" loading="lazy"><div class="m-box"><b>US$ 32 tri</b><span>é o mercado de produtos e serviços para mulheres no mundo</span></div></div>
  <div class="m-copy">
    ${k("03", "O mercado")}
    <h2 class="hb">Um mercado enorme.<span class="dim">E o modelo já provado lá fora.</span></h2>
    <dl class="stats-rows">
      <div><dt>€ 10,8 bi</dt><dd><b>de GMV da Vinted,</b> o P2P de moda europeu, em 2025. Cresceu 47% no ano.</dd></div>
      <div><dt>10x</dt><dd><b>cresceu o acervo da Pickle,</b> o P2P de aluguel de Nova York, em três anos: hoje são mais de 500 mil peças.</dd></div>
      <div><dt>Asset light</dt><dd><b>O modelo escala</b> com a peça da lender e o capital do veículo, não com o caixa da Circulei.</dd></div>
    </dl>
    <p class="fine">Fontes: BCG, The $32 Trillion Opportunity, 2024. Vinted: resultados de 2025, publicados em abril de 2026. Pickle: TechCrunch (out/23) e site (out/26).</p>
  </div>
</section>

<section class="d-dark">
  <div class="wrap">
    ${k("04", "Onde estamos")}
    <h2 class="hb">A rede já gira.<span class="dim">E a cliente volta.</span></h2>
    <p class="lede">Uma rede nacional de closets, com cliente que volta e aquisição que se paga.</p>
    <div class="big-stats">
      <div><svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg><b>800+</b><span>transações em 100 cidades</span></div>
      <div><svg viewBox="0 0 24 24"><path d="m4 16 5-5 4 4 7-7M15 8h5v5"/></svg><b class="o">10,4x</b><span>o GMV de janeiro a setembro de 2026</span></div>
      <div><svg viewBox="0 0 24 24"><path d="M4 11a7 7 0 0 1 12-4l2 2M20 13a7 7 0 0 1-12 4l-2-2M18 5v4h-4M6 19v-4h4"/></svg><b>~50%</b><span>de recorrência: o volume que vem de quem volta</span></div>
      <div><svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="5"/><circle cx="16" cy="16" r="4"/></svg><b>7x</b><span>LTV sobre CAC</span></div>
    </div>
    <p class="fine">Dados operacionais da Circulei, de janeiro a setembro de 2026.</p>
  </div>
</section>

<section class="d-sec wrap">
  ${k("05", "Modelo de negócio")}
  <h2 class="hb">Margem alta. Pouco capital.<span class="dim">Feito pra escalar.</span></h2>
  <div class="model">
    <figure class="fall">
      <figcaption class="tl-label">De cada R$ 1.000 de GMV</figcaption>
      <div class="fall-cols">${FALL.map(([t, s, a, b, kind]) => `<div class="fc"><div class="fb"><i class="${kind}" style="--a:${a / 10}%;--b:${b / 10}%"><span>R$ ${(b - a).toLocaleString("pt-BR")}</span></i></div><p><b>${t}</b>${s}</p></div>`).join("")}</div>
    </figure>
    <div class="take">
      <p class="tl-label">Take efetivo</p>
      <p class="take-n">41,1<span>%</span></p>
      <p>medido em mais de 700 transações: 30% no P2P, 50% quando a Circulei faz a gestão da peça, e as peças da casa.</p>
      <dl class="mini"><div><dt>76,6%</dt><dd>de margem bruta</dd></div><div><dt>R$ 67</dt><dd>de CAC</dd></div><div><dt>+31%</dt><dd>no ticket, de julho a setembro</dd></div><div><dt>7x</dt><dd>LTV sobre CAC</dd></div></dl>
    </div>
  </div>
</section>

<section class="yield d-yield">
  <div class="wrap y-grid">
    <div>
      ${k("06", "Moda como ativo")}
      <h2 class="hb">A peça curada rende.<span class="dim">E o caixa entra antes do custo.</span></h2>
      <p class="tl-label">Rendimento anual sobre o custo da peça</p>
      <table class="bars">${(
        [
          ["IFIX (fundos imobiliários)", 5.1, ""],
          ["IMA-B (títulos IPCA+)", 13.8, ""],
          ["CDI", 14.6, ""],
          ["Média das peças do site", 50.8, "avg"],
          ["Carteira curada da Circulei", 207, "top"],
        ] as [string, number, string][]
      ).map(([t, v, c]) => `<tr class="y-${c}"><th>${t}</th><td><i style="--w:${Math.max(1.5, (v / 207) * 100).toFixed(1)}%"></i></td><td class="v">${v.toLocaleString("pt-BR")}%</td></tr>`).join("")}</table>
      <p class="fine">Bruto, sobre o custo da peça. Não é promessa de retorno.</p>
    </div>
    <div class="cashbox">
      <h3>O caixa entra antes do custo.</h3>
      <p>A cliente paga na reserva e a dona só recebe no mês seguinte. Desse dinheiro em trânsito nasce o potencial de fintech: carteira e crédito na plataforma.</p>
      <ul>
        <li>${ib(ICON.cash)}A cliente paga na reserva</li>
        <li>${ib(ICON.truck)}A peça viaja e volta</li>
        <li>${ib(ICON.loop)}A peça gira de novo</li>
        <li>${ib(ICON.hand, true)}A dona recebe no mês seguinte</li>
      </ul>
    </div>
  </div>
</section>

<section class="d-sec wrap">
  ${k("07", "Por que agora")}
  <h2 class="hb">A IA faz o que antes<span class="dim">pedia um exército.</span></h2>
  <p class="statement"><b>A Nina já atende, e o dado que só a Circulei tem vai ensinar a curadoria a aprovar e precificar.</b> A operação escala sem crescer em gente.</p>
  <div class="cols four">
    <div>${ib(ICON.bot)}<div><b>Nina <em class="new">No ar</em></b><p>A atendente de IA que nós mesmas construímos: responde a cliente na hora, a qualquer hora.</p></div></div>
    <div>${ib(ICON.brain)}<div><b>Curadoria com IA</b><p>O dado de 1.756 peças e 24 meses de giro para aprovar, sugerir o preço e montar a carteira do veículo.</p></div></div>
    <div>${ib(ICON.spark)}<div><b>Personal stylist <em class="new">Protótipo</em></b><p>A cliente conta a ocasião, "casamento na praia, não curto decote", e recebe as peças certas no tamanho dela. <a href="/?q=casamento%20na%20praia%2C%20n%C3%A3o%20curto%20decote">Experimente ${ARROW}</a></p></div></div>
    <div>${ib(ICON.image)}<div><b>Prova virtual</b><p>A cliente vê como a peça fica no corpo dela antes de alugar.</p></div></div>
  </div>
</section>

<section class="d-team">
  <div class="wrap">
    ${k("08", "Time")}
    <h2 class="hw">Skills complementares</h2>
    <div class="founders">
      <div><img src="/deck/gabriele.jpg" alt="Gabriele Fischer" loading="lazy"><div><p class="k2">CEO</p><h3>Gabriele Fischer</h3><p class="role">Finanças e produto</p><p>Ex-VC na Quartzo e na Indicator. Geriu sozinha o fundo de US$ 4,5 milhões da Aliança IA para Educação, dos institutos Lemann, Telles e VélezReyes+, e viveu por dentro a captação de US$ 3 milhões da Hubii, liderada pela Headline. Professora de Produto na Link School of Business. Construiu o backend da Circulei.</p></div></div>
      <div><img src="/deck/julia.jpg" alt="Julia Franco" loading="lazy"><div><p class="k2">CMO</p><h3>Julia Franco</h3><p class="role">Marca, growth e desenvolvimento da oferta</p><p>Lidera o posicionamento, a identidade e a distribuição orgânica da marca. Construiu uma comunidade de 30 mil seguidores para a Circulei sem mídia paga e tem audiência própria de mais de 33 mil no Instagram e TikTok. Designer, com experiência em marca para Hering, Intimissimi e Isdin.</p></div></div>
    </div>
  </div>
  <div class="angels">
    <div class="wrap">
      <p class="tl-label">Primeiros anjos</p>
      <ul>${ANGELS.map(([f, n, r, a]) => `<li><img src="/deck/${f}.jpg" alt="" loading="lazy" width="64" height="64"><b>${n}</b><span>${r}</span><em>${a}</em></li>`).join("")}</ul>
    </div>
  </div>
</section>

<section class="hero d-close">
  <div class="hero-copy">
    ${logo(true)}
    <h2 class="hw">A plataforma de investimento em moda</h2>
    <p class="lede">O closet parado vira renda, e a peça vira ativo.</p>
    <div class="raise">
      ${kick("Fundraising · Pré-seed")}
      <p class="raise-n">R$ 1,75 milhão</p>
      <div class="contacts"><p><b>Gabriele Fischer · CEO</b><a href="mailto:fischer@circulei.co">fischer@circulei.co</a></p><p><b>Site</b><a href="https://circulei.co">circulei.co</a></p></div>
    </div>
  </div>
  <div class="hero-art one"><span class="f f0"><img src="/deck/fundadoras.jpg" alt="Gabriele Fischer e Julia Franco, fundadoras da Circulei" loading="lazy"></span></div>
</section>
</main>
${footer}
</body></html>`;
}

const CSS = `
.deck .hero{min-height:min(100svh,860px)}
.d-logo{display:block;margin-bottom:clamp(48px,10vh,120px)}
.d-logo img,.d-close .hero-copy>img{width:150px;height:auto}
.d-close .hero-copy>img{margin-bottom:clamp(40px,8vh,96px)}
.k b{color:var(--ink);font-weight:700}
.hero .k b,.d-dark .k b{color:#fff}
.d-sec{padding-top:clamp(72px,10vw,140px)}
.d-sec .hb{max-width:24ch}
.tl-label{margin:56px 0 0;font:600 12px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}
.d-sec .tl{margin-top:22px}
.cols{display:grid;grid-template-columns:repeat(3,1fr);margin-top:44px;border-top:1px solid var(--ink)}
.cols>div{display:flex;gap:18px;padding:28px 28px 8px 0}
.cols>div+div{padding-left:28px;border-left:1px solid var(--line)}
.cols.four{grid-template-columns:repeat(4,1fr)}
.cols.four>div{flex-direction:column}
.cols b{display:block;font:700 21px/1.25 var(--sans)}
.cols p{margin:8px 0 0;color:var(--ink-2)}
.cols a{color:var(--orange);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.cols a svg{width:16px;height:16px;stroke-width:2}
.ib{flex:none;display:grid;place-items:center;width:54px;height:54px;border:1px solid var(--ink)}
.ib svg{width:24px;height:24px}
.ib.hot{border-color:var(--orange);color:var(--orange)}
.k2{margin:0 0 6px;font:600 11px var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2)}
.new{font:700 10px var(--sans);font-style:normal;letter-spacing:.1em;text-transform:uppercase;background:var(--orange);color:#fff;padding:3px 6px;vertical-align:3px;margin-left:6px}

.d-market{display:grid;grid-template-columns:minmax(0,.62fr) minmax(0,1fr);margin-top:clamp(72px,10vw,140px)}
.m-img{position:relative;min-height:560px;background:var(--black)}
.m-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.m-box{position:absolute;left:0;right:0;bottom:0;padding:clamp(24px,3vw,40px);background:var(--black);color:#fff}
.m-box b{display:block;font:800 clamp(2.6rem,5vw,4.4rem)/1 var(--sans);letter-spacing:-.03em}
.m-box span{display:block;margin-top:12px;color:var(--on-black-2);max-width:30ch}
.m-copy{padding:clamp(40px,5vw,72px) var(--gut)}
.stats-rows{margin:40px 0 20px;border-top:1px solid var(--ink)}
.stats-rows div{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1fr);gap:24px;align-items:center;padding:22px 0;border-bottom:1px solid var(--line)}
.stats-rows dt{font:800 clamp(2rem,4vw,3.6rem)/1 var(--sans);letter-spacing:-.03em}
.stats-rows dd{margin:0;color:var(--ink-2)}.stats-rows dd b{color:var(--ink)}

.d-dark{background:var(--black);color:#fff;margin-top:clamp(72px,10vw,140px);padding:clamp(72px,10vw,140px) 0}
.d-dark .k{color:var(--on-black-2)}
.d-dark .hb .dim{color:var(--on-black-dim)}
.d-dark .lede{max-width:46ch}
.big-stats{display:grid;grid-template-columns:repeat(4,1fr);margin:56px 0 32px;border-top:1px solid var(--rule-dark)}
.big-stats div{padding:28px 20px 0 0;display:grid;align-content:start;gap:14px}
.big-stats div+div{padding-left:24px;border-left:1px solid var(--rule-dark)}
.big-stats svg{width:24px;height:24px;color:var(--on-black-2)}
.big-stats b{font:800 clamp(3rem,6.4vw,6rem)/.95 var(--sans);letter-spacing:-.04em}
.big-stats b.o{color:var(--orange)}
.big-stats span{color:var(--on-black-2);font-size:17px;max-width:20ch}
.d-dark .fine{color:var(--on-black-dim)}

.model{display:grid;grid-template-columns:1.3fr 1fr;gap:clamp(32px,5vw,80px);margin-top:20px;align-items:end}
.fall{margin:0}
.fall-cols{display:grid;grid-template-columns:repeat(5,1fr);gap:clamp(6px,1.4vw,18px);margin-top:48px}
.fb{position:relative;height:clamp(200px,24vw,300px);border-bottom:1px solid var(--ink)}
.fb i{position:absolute;left:0;right:0;bottom:var(--a);height:calc(var(--b) - var(--a));animation:grow .9s var(--ease) backwards}
.fb i.b{background:var(--ink)}.fb i.g{background:oklch(0.86 0 0)}.fb i.o{background:var(--orange)}
.fb i span{position:absolute;bottom:100%;left:0;right:0;text-align:center;padding-bottom:6px;font:800 clamp(12px,1.4vw,18px) var(--sans);white-space:nowrap}
@keyframes grow{from{clip-path:inset(100% 0 0 0)}}
.fc p{margin:10px 0 0;text-align:center;font-size:13px;color:var(--ink-2);line-height:1.3}
.fc p b{display:block;color:var(--ink);font-size:clamp(12px,1.2vw,15px)}
.take{border-top:1px solid var(--ink)}
.take .tl-label{margin-top:18px}
.take-n{margin:6px 0 10px;font:800 clamp(4.4rem,9vw,8rem)/.9 var(--sans);letter-spacing:-.05em}
.take-n span{color:var(--orange)}
.take>p:not(.tl-label):not(.take-n){color:var(--ink-2)}
.mini{display:grid;grid-template-columns:1fr 1fr;margin:20px 0 0;border-top:1px solid var(--line)}
.mini div{padding:14px 0;border-bottom:1px solid var(--line)}
.mini div:nth-child(odd){padding-right:16px;border-right:1px solid var(--line)}
.mini div:nth-child(even){padding-left:16px}
.mini dt{font:800 28px/1 var(--sans);letter-spacing:-.02em}
.mini dd{margin:6px 0 0;font-size:14px;color:var(--ink-2)}

.d-yield{margin-top:clamp(72px,10vw,140px)}
.cashbox{background:var(--black);color:#fff;padding:clamp(24px,3vw,40px)}
.cashbox h3{font:700 24px/1.2 var(--sans)}
.cashbox>p{color:var(--on-black-2);margin:12px 0 22px}
.cashbox ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.cashbox li{display:flex;align-items:center;gap:16px;font-weight:600}
.cashbox .ib{width:40px;height:40px;border-color:oklch(0.5 0 0)}
.cashbox .ib svg{width:20px;height:20px}
.cashbox .ib.hot{border-color:var(--orange)}
.statement{font:700 clamp(1.3rem,2.4vw,2rem)/1.3 var(--sans);max-width:42ch;margin:36px 0 0;color:var(--dim)}
.statement b{color:var(--ink)}

.d-team{padding-top:clamp(72px,10vw,140px)}
.founders{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,4vw,64px);margin:40px 0 0}
.founders>div{display:grid;grid-template-columns:minmax(140px,.8fr) 1fr;gap:24px;align-items:start}
.founders img{width:100%;aspect-ratio:3/4;object-fit:cover}
.founders h3{font:800 clamp(1.6rem,2.4vw,2.2rem)/1.05 var(--sans);letter-spacing:-.02em}
.founders .role{font-weight:700;margin:6px 0 14px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.founders p{margin:0;color:var(--ink-2)}
.angels{background:var(--stone);margin-top:clamp(48px,6vw,80px);padding:36px 0 44px}
.angels .tl-label{margin:0 0 20px}
.angels ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(6,1fr);gap:20px}
.angels li{display:grid;gap:2px;font-size:13px;color:var(--ink-2)}
.angels img{width:64px;height:64px;object-fit:cover;margin-bottom:10px}
.angels b{font-size:16px;color:var(--ink)}
.angels em{font:600 11px var(--sans);font-style:normal;letter-spacing:.14em;text-transform:uppercase;margin-top:4px}

.d-close{margin-top:0}
.d-close .lede{margin-bottom:0}
.raise{margin-top:36px;padding-top:22px;border-top:1px solid var(--rule-dark)}
.raise-n{margin:0;font:800 clamp(2.8rem,5.6vw,5rem)/1 var(--sans);letter-spacing:-.04em}
.contacts{display:flex;gap:40px;flex-wrap:wrap;margin-top:24px}
.contacts p{margin:0;display:grid;gap:2px}
.contacts a{color:var(--on-black-2);text-decoration:none}.contacts a:hover{color:#fff}

@media (max-width:960px){
  .cols,.cols.four{grid-template-columns:1fr}
  .cols>div+div{padding-left:0;border-left:0;border-top:1px solid var(--line)}
  .cols.four>div{flex-direction:row}
  .d-market{grid-template-columns:1fr}
  .m-img{min-height:0;aspect-ratio:4/5}
  .stats-rows div{grid-template-columns:1fr;gap:6px}
  .big-stats{grid-template-columns:1fr 1fr}
  .big-stats div:nth-child(3){padding-left:0;border-left:0}
  .big-stats div:nth-child(n+3){border-top:1px solid var(--rule-dark);margin-top:28px}
  .model{grid-template-columns:1fr}
  .founders{grid-template-columns:1fr}
  .founders>div{grid-template-columns:120px 1fr}
  .angels ul{grid-template-columns:1fr 1fr;gap:24px 16px}
  .d-logo{margin-bottom:28px}
  .deck .hero{min-height:0}
}
`;
