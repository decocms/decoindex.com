/**
 * The landing page. Audience is developers building agents, not merchants and
 * not shoppers, so the hero is a URL you can paste and a response you can read.
 *
 * Design system is deco's: Switzer at weight 400, lime #D0EC1A on forest #07401A,
 * pill controls, hairline borders, no shadows on flat content. Hand-written CSS —
 * there is no build step in a Worker and this page does not need one.
 *
 * The side-by-side comparison shows the *real* current document, read from our
 * own KV. A page that argues for honest data has no business illustrating itself
 * with a mockup, and a hand-written sample rots the moment the format changes.
 */

/** The product the comparison is built from. Real, in stock, cheap to re-check. */
export const SAMPLE = {
  domain: "farmrio.com.br",
  path: "/copo-quencher-stanley-destiny-x-farm-rio-887ml-multicolorido-374774-2276/p",
  /** Measured 2026-08-31; refreshed by hand when the sample changes. */
  htmlBytes: 1_398_266,
  /** Verbatim from the top of that response, not a reconstruction. */
  htmlHead:
    '<!DOCTYPE html><html lang="pt-BR"><head><title>Copo Quencher Stanley Destiny x Farm Rio 887ml</title>' +
    '<link rel="modulepreload" href="/_frsh/js/d75752cc540895ef5acbd1048e35423152553736/main.js"/>' +
    '<link rel="modulepreload" href="/_frsh/js/d75752cc5408.../chunk-BEGOSeOy.js"/>' +
    '<link rel="modulepreload" href="/_frsh/js/d75752cc5408.../island-tryonmodal.js"/>…',
} as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const kb = (bytes: number) =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

export function landingHtml(origin: string, sampleMd: string | null): string {
  const sampleUrl = `${origin}/${SAMPLE.domain}${SAMPLE.path}`;
  const merchantUrl = `https://www.${SAMPLE.domain}${SAMPLE.path}`;
  // If the sample is not in cache yet, say so rather than showing a stand-in.
  const md = sampleMd ?? "Fetching this document for the first time — reload in a moment.";
  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    switch (k) {
      case "origin": return origin;
      case "sampleUrl": return sampleUrl;
      case "merchantUrl": return merchantUrl;
      case "sampleUrlShort": return `${origin.replace(/^https?:\/\//, "")}/${SAMPLE.domain}/…/p`;
      case "merchantUrlShort": return `www.${SAMPLE.domain}/…/p`;
      case "htmlSize": return kb(SAMPLE.htmlBytes);
      case "mdSize": return sampleMd ? kb(new TextEncoder().encode(sampleMd).length) : "—";
      case "htmlHead": return esc(SAMPLE.htmlHead);
      case "sampleMd": return esc(md);
      default: return "";
    }
  });
}

const TEMPLATE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>decoindex — storefronts your agent can actually read</title>
<meta name="description" content="Swap the origin of any VTEX or Shopify storefront URL for clean Markdown: title, variants, the price we saw, and a cart link for every item in stock.">
<meta name="theme-color" content="#07401A">
<link rel="canonical" href="{{origin}}/">
<!-- Agents that land on the HTML should find the machine-readable spec without
     reading the page. rel=llms-txt is the emerging convention; the alternate
     link is what a client honouring content negotiation looks for. -->
<link rel="llms-txt" type="text/markdown" href="{{origin}}/llms.txt">
<link rel="alternate" type="text/markdown" href="{{origin}}/llms.txt" title="decoindex for agents">
<meta name="llms-txt" content="{{origin}}/llms.txt">
<meta property="og:type" content="website">
<meta property="og:site_name" content="decoindex">
<meta property="og:url" content="{{origin}}/">
<meta property="og:title" content="decoindex — storefronts your agent can actually read">
<meta property="og:description" content="Swap the origin of any VTEX or Shopify storefront URL for clean Markdown. Same product page: 1.3 MB of HTML, or 4 KB you can use.">
<meta property="og:image" content="{{origin}}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A bar chart comparing one product page as .html and as .md: 1.3 MB against 4 KB, 99.7% fewer tokens.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="decoindex — storefronts your agent can actually read">
<meta name="twitter:description" content="Swap the origin of any VTEX or Shopify storefront URL for clean Markdown. Same product page: 1.3 MB of HTML, or 4 KB you can use.">
<meta name="twitter:image" content="{{origin}}/og.png">
<!-- Everything that navigates away opens in a new tab, including the link the demo
     widget builds. Same-page anchors opt back out with target="_self". -->
<base target="_blank">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='16' fill='%23D0EC1A'/%3E%3C/svg%3E">
<link rel="preload" href="https://www.decocms.com/fonts/switzer/Switzer-Variable.woff2" as="font" type="font/woff2" crossorigin="anonymous">
<style>
@font-face{font-family:"Switzer";font-style:normal;font-weight:100 900;font-display:swap;
  src:url("https://www.decocms.com/fonts/switzer/Switzer-Variable.woff2") format("woff2")}

:root{
  --ink:#282524; --muted:#6E6863; --faint:#A6A09D;
  --soft:#5E7500; --green:#D0EC1A; --green-2:#DCEF63; --forest:#07401A;
  --paper:#fff; --paper-2:#FAFAF9; --paper-3:#F6F4F1;
  --hairline:rgba(40,37,36,.09); --hairline-w:rgba(255,255,255,.14);
  --ease:cubic-bezier(.25,1,.5,1); --ease-slow:cubic-bezier(.16,1,.3,1);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:"Switzer","Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:400;
  background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;
  font-feature-settings:"cv01","cv02","cv03","cv04","ss08"}
::selection{background:rgba(208,236,26,.55);color:var(--ink)}
:focus-visible{outline:2px solid var(--soft);outline-offset:3px}
a{color:inherit}

.wrap{max-width:1100px;margin:0 auto;padding:0 24px}
@media(min-width:768px){.wrap{padding:0 40px}}
section{padding:72px 0}
@media(min-width:768px){section{padding:104px 0}}

h1,h2,h3{font-weight:400;margin:0;text-wrap:balance}
h1{font-size:clamp(36px,5vw,60px);line-height:1.06;letter-spacing:-.025em}
h2{font-size:clamp(28px,3.4vw,42px);line-height:1.14;letter-spacing:-.018em}
h3{font-size:18px;line-height:1.5;font-weight:500}
p{margin:0;line-height:1.6}
.dim{opacity:.55}
.eyebrow{font-size:13px;line-height:1;letter-spacing:-.005em;text-transform:uppercase;color:var(--soft);margin:0 0 14px}
.lede{font-size:18px;line-height:1.6;color:var(--muted);max-width:620px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:12px 24px;border-radius:999px;font-size:16px;font-weight:500;line-height:24px;
  cursor:pointer;text-decoration:none;border:0;font-family:inherit;
  transition:transform .25s var(--ease),background-color .25s ease,opacity .25s ease}
.btn:active{transform:scale(.97)}
.btn-lime{background:var(--green);color:var(--forest)}
.btn-lime:hover{background:var(--green-2)}
.btn-ink{background:var(--ink);color:#fff}
.btn-ink:hover{background:#34454d}
.btn-ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--hairline)}
.btn-ghost:hover{background:rgba(40,37,36,.04)}

/* ---- header ---- */
header{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.86);backdrop-filter:blur(16px);
  border-bottom:1px solid var(--hairline)}
.hd{display:flex;align-items:center;gap:16px;height:60px}
.hd .brand{display:flex;align-items:baseline;gap:8px;font-size:17px;letter-spacing:-.02em;text-decoration:none}
.hd .brand b{font-weight:500}
.hd .brand span{font-size:12px;color:var(--faint)}
.hd nav{margin-left:auto;display:flex;align-items:center;gap:8px}
.hd nav a{font-size:14px;color:var(--muted);text-decoration:none;padding:8px 10px;transition:color .3s}
.hd nav a:hover{color:var(--ink)}
/* The wordmark keeps its own line at every width; the tagline is the first
   thing to go, along with the secondary nav. */
@media(max-width:640px){.hd nav a.hide-sm,.hd .brand span{display:none}}

/* ---- hero ---- */
.hero{padding-top:64px;padding-bottom:24px}
@media(min-width:768px){.hero{padding-top:104px}}
.hero .lede{margin-top:24px}
.cta-row{margin-top:36px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
/* --faint fails WCAG AA at 13px (2.6:1 on white). Fine print is still print. */
.fine{margin-top:14px;font-size:13px;color:var(--muted)}

/* ---- demo widget ---- */
.demo{margin-top:56px;border:1px solid var(--hairline);border-radius:16px;overflow:hidden;background:var(--paper-2)}
.demo-in{padding:20px}
.demo label{display:block;font-size:13px;color:var(--muted);margin-bottom:10px}
.field{display:flex;gap:8px;flex-wrap:wrap}
.field input{flex:1 1 340px;min-width:0;font:inherit;font-size:15px;padding:12px 18px;
  border-radius:999px;border:1px solid rgba(40,37,36,.14);background:#fff;color:var(--ink)}
.field input::placeholder{color:var(--faint)}
.out{border-top:1px solid var(--hairline);padding:20px;background:#fff;
  display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.out .arrow{color:var(--faint);font-size:13px}
.out a{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;
  color:var(--soft);word-break:break-all;text-decoration:none;border-bottom:1px solid rgba(94,117,0,.3)}
.out a:hover{border-bottom-color:var(--soft)}
.chips{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
.chip{font-size:12px;color:var(--muted);background:#fff;border:1px solid var(--hairline);
  border-radius:999px;padding:5px 12px;cursor:pointer;font-family:inherit;transition:background .2s}
.chip:hover{background:var(--paper-3)}

/* ---- before / after ---- */
/* align-items:start so each pane is its own height — the excerpt is short and
   the full document is long, and stretching the short one leaves dead space. */
.split{display:grid;gap:16px;grid-template-columns:1fr;align-items:start}
@media(min-width:900px){.split{grid-template-columns:1fr 1fr;gap:24px}}
.pane{border:1px solid var(--hairline);border-radius:16px;overflow:hidden;background:#fff}
/* Wraps rather than pushing the content-type label off a narrow screen — the
   two labels are the whole point of the before/after comparison. */
.pane header{position:static;background:var(--paper-3);border:0;border-bottom:1px solid var(--hairline);
  padding:12px 18px;font-size:13px;color:var(--muted);
  display:flex;justify-content:space-between;gap:4px 12px;flex-wrap:wrap}
.pane header a{color:var(--soft);text-decoration:none;border-bottom:1px solid rgba(94,117,0,.28)}
.pane header a:hover{border-bottom-color:var(--soft)}
/* Tall enough to read, scrollable for the rest: this is the whole document. */
.pane pre{margin:0;padding:18px;overflow:auto;max-height:min(60vh,520px);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.65;color:#3f3a37;
  white-space:pre;tab-size:2}
.pane.bad pre{color:var(--faint);white-space:pre-wrap;word-break:break-all;max-height:200px}
.pane-note{margin:0;padding:12px 18px;border-top:1px solid var(--hairline);
  font-size:12.5px;line-height:1.5;color:var(--muted);background:var(--paper-2)}

/* ---- feature rows ---- */
.rows{border-top:1px solid var(--hairline)}
.row{display:grid;gap:6px;padding:22px 0;border-bottom:1px solid var(--hairline)}
@media(min-width:768px){.row{grid-template-columns:220px 1fr;gap:32px;align-items:baseline}}
.row h3{font-size:17px}
.row p{font-size:15px;color:var(--muted)}

/* ---- honesty band ---- */
.band{background:var(--paper-3)}
.cards{display:grid;gap:16px;grid-template-columns:1fr;margin-top:32px}
@media(min-width:768px){.cards{grid-template-columns:1fr 1fr}}
.card{background:#fff;border:1px solid var(--hairline);border-radius:16px;padding:24px}
.card h3{margin-bottom:12px}
.card ul{margin:0;padding-left:18px;color:var(--muted);font-size:15px;line-height:1.75}
.card.yes h3{color:var(--soft)}

/* ---- claim / forest band ---- */
.forest{background:var(--forest);color:#E7E5E4;border-radius:20px;padding:56px 24px;text-align:center}
@media(min-width:768px){.forest{padding:80px 40px}}
.forest h2{color:var(--green);max-width:640px;margin:0 auto}
.forest p{color:#E7E5E4;opacity:.82;max-width:560px;margin:20px auto 0}
.forest .cta-row{justify-content:center}

footer{border-top:1px solid var(--hairline);padding:36px 0;font-size:13px;color:var(--faint)}
.foot{display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.foot a{color:var(--muted);text-decoration:none}
.foot a:hover{color:var(--ink)}
.foot .sp{margin-left:auto}

/* ---- entrance, no JS ---- */
.enter{opacity:1;transform:none;
  transition:opacity 1.1s var(--ease-slow),transform 1.1s var(--ease-slow);
  transition-delay:var(--d,0ms)}
@starting-style{.enter{opacity:0;transform:translateY(20px)}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>

<header>
  <div class="wrap hd">
    <a class="brand" href="/" target="_self"><b>decoindex</b><span>commerce index by decocms.com</span></a>
    <nav>
      <a class="hide-sm" href="/llms.txt">llms.txt</a>
      <a class="hide-sm" href="/about">About</a>
      <a href="#claim" target="_self" class="btn btn-ink" style="padding:8px 18px;font-size:14px">Claim your store</a>
    </nav>
  </div>
</header>

<section class="hero">
  <div class="wrap">
    <h1 class="enter">Storefronts your agent<br>can actually read.<br><span class="dim">One URL swap.</span></h1>
    <p class="lede enter" style="--d:120ms">
      Ask a storefront for a product page and you get a megabyte of markup with the details
      scattered through script tags. Point the same URL here and you get the title, every
      variant with its own price and stock, and a link that drops the item into a cart.
    </p>

    <div class="demo enter" style="--d:220ms">
      <div class="demo-in">
        <label for="u">Paste a storefront URL</label>
        <div class="field">
          <input id="u" type="url" spellcheck="false" autocomplete="off"
                 placeholder="https://www.farmrio.com.br/moda-feminina/acessorios">
        </div>
        <div class="chips">
          <button class="chip" data-u="https://www.farmrio.com.br/moda-feminina/acessorios">VTEX category</button>
          <button class="chip" data-u="https://www.allbirds.com/products/mens-strider-explore">Shopify product</button>
          <button class="chip" data-u="https://www.osklen.com.br/">VTEX homepage</button>
        </div>
      </div>
      <div class="out">
        <span class="arrow">GET</span>
        <a id="o" href="#" rel="noopener">decoindex.com/&lt;domain&gt;/&lt;path&gt;</a>
      </div>
    </div>

    <div class="cta-row enter" style="--d:300ms">
      <a class="btn btn-lime" href="#try" target="_self">See a real response ↓</a>
      <a class="btn btn-ghost" href="/llms.txt">Read the spec</a>
    </div>
    <p class="fine enter" style="--d:340ms">Open it in a browser, curl it, or hand it straight to a model. Public catalog data only.</p>
  </div>
</section>

<section id="try">
  <div class="wrap">
    <h2>The same product page, twice.<br><span class="dim">{{htmlSize}} of HTML, or {{mdSize}} you can use.</span></h2>
    <p class="fine">Both panes are live. Open either one and check.</p>
    <div class="split" style="margin-top:28px">
      <div class="pane bad">
        <header>
          <a href="{{merchantUrl}}" target="_blank" rel="noopener">GET {{merchantUrlShort}} ↗</a>
          <span>text/html · {{htmlSize}}</span>
        </header>
<pre>{{htmlHead}}</pre>
        <p class="pane-note">Excerpt. The formatted price a shopper sees never appears in this
           document — only a bare <code>419</code>, inside a JSON-LD script tag, 70 scripts deep.</p>
      </div>
      <div class="pane">
        <header>
          <a href="{{sampleUrl}}" target="_blank" rel="noopener">GET {{sampleUrlShort}} ↗</a>
          <span>text/markdown · {{mdSize}}</span>
        </header>
<pre>{{sampleMd}}</pre>
        <p class="pane-note">The whole document, exactly as served right now.</p>
      </div>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="wrap">
    <div class="rows">
      <div class="row">
        <h3>Every page, not just products</h3>
        <p>Product pages, category listings and the storefront's own front page all answer the
           same way. Take a URL you already have and put <code>decoindex.com</code> in front of
           the domain — there's nothing else to learn.</p>
      </div>
      <div class="row">
        <h3>Quick the second time you look</h3>
        <p>The first request goes and fetches the page. Every one after that comes back from the
           edge in a few milliseconds, and the merchant's servers don't hear from us again.</p>
      </div>
      <div class="row">
        <h3>It ends in a cart, not a dead end</h3>
        <p>Every variant that's in stock comes with a link that builds a cart on the merchant's
           own checkout. Your agent hands that to a person, who reviews the price and shipping
           and pays. You never touch anyone's card.</p>
      </div>
      <div class="row">
        <h3>Markdown, or JSON if you'd rather</h3>
        <p>Add <code>.json</code> to any URL for the same document, structured. Long listings
           continue with <code>?page=2</code>.</p>
      </div>
      <div class="row">
        <h3>The merchant stays the destination</h3>
        <p>We keep these pages out of search results, point every one back at the merchant's own,
           never rehost their images, and tag outbound links so they can see the visit came
           through an agent. If you're building for a brand, you can tell them that.</p>
      </div>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>Some questions we can answer.<br><span class="dim">Some only the merchant can.</span></h2>
    <p class="lede" style="margin-top:20px">Sooner or later a shopper asks your agent “is it still there in
       my size, and when does it arrive?” Two of those words — <em>still</em> and <em>when</em> — are
       things we genuinely don't know. Here's the line, so you can draw it too.</p>
    <div class="cards">
      <div class="card yes">
        <h3>Safe to repeat</h3>
        <ul>
          <li>Title, brand and description</li>
          <li>Every variant and its SKU</li>
          <li>Where it sits in the catalogue</li>
          <li>The price and stock we saw, with a timestamp</li>
          <li>A cart link on the merchant's checkout</li>
        </ul>
      </div>
      <div class="card">
        <h3>Send them to the merchant</h3>
        <ul>
          <li>Whether that size is still there right now</li>
          <li>The final price once discounts and coupons land</li>
          <li>When it arrives at a particular address</li>
          <li>Anything priced for one specific shopper</li>
        </ul>
      </div>
    </div>
    <p class="fine" style="max-width:640px">Every response repeats this in its own body, so an agent that
       reads a single page in isolation still knows what it can and can't promise.</p>
  </div>
</section>

<section id="claim">
  <div class="wrap">
    <div class="forest">
      <p class="eyebrow" style="color:var(--green-2)">For merchants</p>
      <h2>Agents are already shopping.<br>Be legible to them.</h2>
      <p>Reading your catalogue is free and stays free. If you want search across it, or a feed
         of what agents keep asking for, come talk to us. And if you'd rather we weren't here at
         all, say so — we'll stop within a day.</p>
      <div class="cta-row">
        <a class="btn btn-lime" href="mailto:hi@deco.cx?subject=decoindex%20%E2%80%94%20claim%20my%20store&body=Store%20domain%3A%20%0APlatform%3A%20%0AName%3A%20">Claim your store</a>
        <a class="btn" style="background:rgba(255,255,255,.14);color:#fff" href="/opt-out">Opt out</a>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap foot">
    <span>decoindex — commerce index by <a href="https://decocms.com">decocms.com</a></span>
    <span class="sp"></span>
    <a href="/about">About</a>
    <a href="/llms.txt">llms.txt</a>
    <a href="/opt-out">Opt out</a>
  </div>
</footer>

<script>
(function(){
  var input=document.getElementById('u'), out=document.getElementById('o');
  function rewrite(){
    var raw=(input.value||input.placeholder||'').trim();
    if(!raw) return;
    var u; try{ u=new URL(raw.indexOf('http')===0?raw:'https://'+raw); }catch(e){ return; }
    var host=u.hostname.toLowerCase().replace(/^www\\./,'');
    var target=location.origin+'/'+host+u.pathname+(u.search||'');
    out.textContent=target.replace(/^https?:\\/\\//,'');
    out.href=target;
  }
  input.addEventListener('input',rewrite);
  Array.prototype.forEach.call(document.querySelectorAll('.chip'),function(b){
    b.addEventListener('click',function(){ input.value=b.dataset.u; rewrite(); input.focus(); });
  });
  out.addEventListener('click',function(){
    try{ navigator.sendBeacon('/e',JSON.stringify({name:'demo_click',meta:{href:out.href}})); }catch(e){}
  });
  rewrite();
})();
</script>
</body>
</html>`;
