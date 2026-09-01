/**
 * The bits of the design system more than one page needs.
 *
 * deco's: Switzer at weight 400, lime #D0EC1A on forest #07401A, pill controls,
 * hairline borders, no shadows on flat content. Hand-written CSS — there is no
 * build step in a Worker and these pages do not need one.
 *
 * Page-specific CSS stays on the page. Only what two pages actually share lives
 * here, so this does not slowly become a framework.
 */

/** Tokens, base type, buttons, header, rows, cards, panes, forest band, footer. */
export const STYLE = /* css */ `
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
/* --faint fails WCAG AA at 13px (2.6:1 on white). Fine print is still print. */
.fine{margin-top:14px;font-size:13px;color:var(--muted)}
.cta-row{margin-top:36px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}

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
.hd nav a:hover,.hd nav a[aria-current]{color:var(--ink)}
/* The wordmark keeps its own line at every width; the tagline is the first
   thing to go, along with the secondary nav. */
@media(max-width:640px){.hd nav a.hide-sm,.hd .brand span{display:none}}

/* ---- panes ---- */
/* align-items:start so each pane is its own height — stretching the short one
   leaves dead space. */
.split{display:grid;gap:16px;grid-template-columns:1fr;align-items:start}
@media(min-width:900px){.split{grid-template-columns:1fr 1fr;gap:24px}}
.pane{border:1px solid var(--hairline);border-radius:16px;overflow:hidden;background:#fff}
/* Wraps rather than pushing the label off a narrow screen. */
.pane header{position:static;background:var(--paper-3);border:0;border-bottom:1px solid var(--hairline);
  padding:12px 18px;font-size:13px;color:var(--muted);
  display:flex;justify-content:space-between;gap:4px 12px;flex-wrap:wrap}
.pane header a{color:var(--soft);text-decoration:none;border-bottom:1px solid rgba(94,117,0,.28)}
.pane header a:hover{border-bottom-color:var(--soft)}
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

/* ---- cards ---- */
.band{background:var(--paper-3)}
.cards{display:grid;gap:16px;grid-template-columns:1fr;margin-top:32px}
@media(min-width:768px){.cards{grid-template-columns:1fr 1fr}}
.card{background:#fff;border:1px solid var(--hairline);border-radius:16px;padding:24px}
.card h3{margin-bottom:12px}
.card ul{margin:0;padding-left:18px;color:var(--muted);font-size:15px;line-height:1.75}
.card.yes h3{color:var(--soft)}

/* ---- forest band ---- */
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
`;

/** A lime rounded rect, inline so it costs no request. */
export const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='16' fill='%23D0EC1A'/%3E%3C/svg%3E";

/**
 * Both pages sit behind `<base target="_blank">`, so every same-origin link in
 * the shared chrome has to opt back out with target="_self" or the site opens
 * a new tab for its own navigation.
 */
export function header(active: "benchmark" | null = null): string {
  const mark = (id: string) => (active === id ? ' aria-current="page"' : "");
  return `<header>
  <div class="wrap hd">
    <a class="brand" href="/" target="_self"><b>decoindex</b><span>commerce index by decocms.com</span></a>
    <nav>
      <a class="hide-sm" href="/benchmark" target="_self"${mark("benchmark")}>Benchmark</a>
      <a class="hide-sm" href="/llms.txt">llms.txt</a>
      <a class="hide-sm" href="/about">About</a>
      <a href="#claim" target="_self" class="btn btn-ink" style="padding:8px 18px;font-size:14px">Claim your store</a>
    </nav>
  </div>
</header>`;
}

export const FOOTER = `<footer>
  <div class="wrap foot">
    <span>decoindex — commerce index by <a href="https://decocms.com">decocms.com</a></span>
    <span class="sp"></span>
    <a href="/benchmark" target="_self">Benchmark</a>
    <a href="/about">About</a>
    <a href="/llms.txt">llms.txt</a>
    <a href="/opt-out">Opt out</a>
  </div>
</footer>`;
