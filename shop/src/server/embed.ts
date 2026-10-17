/**
 * `/embed.js` — the partner widget. A store drops one tag on its empty-search
 * page and, instead of a dead end, the shopper gets "busca no deco shop":
 *
 *   <script src="https://shop.decoindex.com/embed.js" async></script>
 *   <script src="…/embed.js" data-q="vestido azul" data-target="#no-results" async></script>
 *
 * The query comes from data-q, or ?q= / ?ft= / /busca/{q} on the page. The link
 * carries store={host}, so the chat searches that store first (see chat.ts).
 * Shadow DOM keeps both stylesheets out of each other's way; the query only
 * ever reaches the DOM through textContent.
 */
export const EMBED_JS = `(() => {
  const me = document.currentScript;
  if (!me) return;
  const origin = new URL(me.src).origin;
  const p = new URLSearchParams(location.search);
  const fromPath = (location.pathname.match(/\\/busca\\/([^/?#]+)/) || [])[1];
  const q = (me.dataset.q || p.get("q") || p.get("ft") || (fromPath ? decodeURIComponent(fromPath).replace(/-/g, " ") : "")).trim().slice(0, 120);
  const href = origin + "/?" + new URLSearchParams({ ...(q ? { q } : {}), store: location.hostname, utm_source: "embed" });

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = '<style>' +
    '@import url("https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap");' +
    ':host{all:initial;display:block}a{all:unset;text-align:left;cursor:pointer;box-sizing:border-box;display:flex;align-items:center;gap:16px;max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid #e5e5e5;border-radius:16px;background:#fff;font:15px/1.35 Switzer,ui-sans-serif,system-ui,sans-serif;color:#0a0a0a;transition:border-color .15s,transform .15s}' +
    'a:hover{border-color:#0a0a0a}a:active{transform:scale(.98)}' +
    '.t{flex:1}.k{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#737373}' +
    '.h{font-weight:500;margin-top:4px}.b{flex:none;padding:10px 16px;border-radius:999px;background:#0a0a0a;color:#fff;font-size:13px;font-weight:500}' +
    '</style><a target="_blank" rel="noopener"><span class="t"><span class="k">deco shop</span><div class="h"></div></span><span class="b">Buscar \\u2192</span></a>';
  const a = root.querySelector("a");
  a.href = href;
  root.querySelector(".h").textContent = q
    ? "N\\u00e3o achou \\u201c" + q + "\\u201d? A gente procura pra voc\\u00ea em v\\u00e1rias marcas."
    : "Procure em v\\u00e1rias marcas brasileiras num chat s\\u00f3.";

  const target = me.dataset.target && document.querySelector(me.dataset.target);
  if (target) target.appendChild(host);
  else me.parentNode.insertBefore(host, me.nextSibling);
})();`;
