/**
 * The landing page has one job: make a developer building an agent understand
 * the primitive in five seconds — you already have a product URL, put ours in
 * front of it. So the hero is the URL itself, being rewritten.
 */
export const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>decoindex — storefronts, readable by agents</title>
<meta name="description" content="Put decoindex.com in front of any storefront URL and get normalized product facts as Markdown, with provenance and a stated freshness boundary.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --paper: #fdfdfc;
    --ink: #15171c;
    --muted: #6b7079;
    --rule: #e2e2de;
    --signal: #3b2fd6;
    --caution: #a35a00;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
    --sans: "IBM Plex Sans", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: var(--sans); font-size: 16px; line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 56px 24px 96px; }
  header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 64px; }
  .mark { font-family: var(--mono); font-weight: 600; letter-spacing: -0.02em; font-size: 15px; }
  .by { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  h1 {
    font-family: var(--mono); font-weight: 500; font-size: clamp(26px, 5vw, 38px);
    line-height: 1.2; letter-spacing: -0.03em; margin: 0 0 20px;
  }
  h1 em { font-style: normal; color: var(--signal); }
  .lede { font-size: 17px; color: var(--muted); max-width: 56ch; margin: 0 0 40px; }

  /* Signature: the URL, being rewritten in place. */
  .rewriter { border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; }
  .rewriter label {
    display: block; font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--muted); padding: 12px 14px 0;
  }
  .rewriter input {
    width: 100%; border: 0; padding: 6px 14px 14px; font-family: var(--mono);
    font-size: 14px; color: var(--ink); background: transparent; outline: none;
  }
  .out { border-top: 1px dashed var(--rule); background: #f7f7f5; padding: 14px; }
  .out a {
    font-family: var(--mono); font-size: 14px; color: var(--signal);
    word-break: break-all; text-decoration: none;
  }
  .out a:hover, .out a:focus-visible { text-decoration: underline; }
  .out .prefix { background: rgba(59,47,214,.1); padding: 1px 2px; border-radius: 2px; }

  .surfaces { margin: 56px 0 0; border-top: 1px solid var(--rule); }
  .surface {
    display: grid; grid-template-columns: 200px 1fr; gap: 16px;
    padding: 16px 0; border-bottom: 1px solid var(--rule); align-items: baseline;
  }
  .surface code { font-family: var(--mono); font-size: 13px; color: var(--ink); }
  .surface p { margin: 0; font-size: 14px; color: var(--muted); }
  @media (max-width: 620px) { .surface { grid-template-columns: 1fr; gap: 4px; } }

  .boundary {
    margin-top: 48px; border-left: 2px solid var(--caution); padding: 4px 0 4px 16px;
    font-size: 14px; color: var(--muted);
  }
  .boundary strong { color: var(--caution); font-weight: 600; }
  footer {
    margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--rule);
    font-family: var(--mono); font-size: 12px; color: var(--muted);
    display: flex; gap: 20px; flex-wrap: wrap;
  }
  footer a { color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="mark">decoindex</span>
    <span class="by">by deco</span>
  </header>

  <h1>Any storefront URL,<br>rewritten for <em>the agent reading it</em>.</h1>
  <p class="lede">
    Product pages are built for browsers: client-rendered, variant state hidden, policies
    three clicks away. Put decoindex in front of the URL and get normalized facts,
    every claim sourced and timestamped.
  </p>

  <div class="rewriter">
    <label for="src">Paste a product URL</label>
    <input id="src" spellcheck="false" autocomplete="off"
      value="https://www.farmrio.com.br/vestido-longo-alca-estampado/p">
    <div class="out"><a id="dst" href="#"></a></div>
  </div>

  <div class="surfaces">
    <div class="surface"><code>/{domain}/{path}.md</code><p>Any product page as normalized Markdown, or <code>.json</code> for the strict record.</p></div>
    <div class="surface"><code>/{domain}/search?q=</code><p>Hybrid lexical and semantic search across the whole catalog. Site search, without the site search.</p></div>
    <div class="surface"><code>/{domain}/llms.txt</code><p>The index, in the format agents already look for.</p></div>
    <div class="surface"><code>/{domain}/products.json</code><p>The full normalized catalog, for agents that index it themselves.</p></div>
  </div>

  <p class="boundary">
    <strong>What we don't answer.</strong> Stock, final price after promotions, delivery dates
    and personalized offers change by the second and by the buyer. Those stay with the merchant,
    and every response says so. An agent that promises what a merchant can't honour costs the
    merchant more than a lost sale.
  </p>

  <footer>
    <a href="/about">About</a>
    <a href="/opt-out">Merchant opt-out</a>
    <a href="https://decocms.com">deco</a>
  </footer>
</div>
<script>
  const src = document.getElementById('src');
  const dst = document.getElementById('dst');
  function rewrite() {
    let raw = src.value.trim();
    if (!raw) { dst.textContent = ''; dst.removeAttribute('href'); return; }
    if (!/^https?:\\/\\//i.test(raw)) raw = 'https://' + raw;
    let u;
    try { u = new URL(raw); } catch { dst.textContent = 'Not a URL yet.'; dst.removeAttribute('href'); return; }
    const domain = u.hostname.replace(/^www\\./, '');
    const path = u.pathname.replace(/\\/$/, '');
    const href = location.origin + '/' + domain + path + '.md';
    dst.innerHTML = '<span class="prefix">' + location.host + '/</span>' + domain + path + '.md';
    dst.setAttribute('href', href);
  }
  src.addEventListener('input', rewrite);
  rewrite();
  dst.addEventListener('click', () => {
    navigator.sendBeacon?.('/e', JSON.stringify({ name: 'demo_click' }));
  });
</script>
</body>
</html>`;
