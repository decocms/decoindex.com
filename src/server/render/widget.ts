/**
 * The inline UI for the two data-bearing tools (search_storefront, get_product).
 * One template, not two — the payload shape decides what renders.
 *
 * Threat model: every string here (title, brand, claim values, image/link
 * URLs) comes from a THIRD-PARTY MERCHANT CATALOG, which is untrusted input
 * that reaches us through an ingestion pipeline we don't control. Because of
 * that:
 *   - no innerHTML with catalog data, ever. DOM is built with createElement +
 *     textContent so a poisoned title can't execute as markup.
 *   - every href/src is passed through safeUrl(), which only allows https:.
 *
 * No React, no bundler — same "plain template string" pattern as landing.ts.
 * Sandboxed host (ChatGPT, Deco Studio) provides window.openai.toolOutput.
 */
export const WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --paper: #fdfdfc; --ink: #15171c; --muted: #6b7079; --rule: #e2e2de;
    --signal: #3b2fd6; --caution: #a35a00;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
    --sans: "IBM Plex Sans", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); font-size: 14px; }
  #root { padding: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .card { border: 1px solid var(--rule); border-radius: 8px; padding: 8px; text-decoration: none; color: var(--ink); display: flex; flex-direction: column; gap: 4px; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 4px; background: var(--rule); }
  .title { font-size: 13px; font-weight: 500; line-height: 1.3; }
  .brand { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .price { font-family: var(--mono); font-size: 13px; }
  .avail { font-size: 11px; color: var(--caution); }
  .empty { color: var(--muted); padding: 24px 8px; text-align: center; }
  .footer { margin-top: 10px; font-size: 11px; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 8px; }
  .pd-title { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
  .pd-row { display: flex; gap: 8px; align-items: baseline; margin: 2px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 8px; }
  th, td { border: 1px solid var(--rule); padding: 4px 6px; text-align: left; }
  ul.claims { font-size: 12px; padding-left: 18px; margin: 8px 0; }
</style>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  // https-only allowlist. Ingestion is VTEX/Shopify-first (see README), so
  // this covers the large majority of indexed images. A merchant on a custom
  // image host renders without a photo until its CDN is added here.
  // ponytail: static CDN allowlist; generate from distinct registry
  // platforms at build time if a self-hosted merchant becomes common.
  var IMG_HOSTS = [/\\.vtexassets\\.com$/, /\\.vteximg\\.com\\.br$/, /^cdn\\.shopify\\.com$/];

  function safeUrl(raw, kind) {
    try {
      var u = new URL(String(raw));
      if (u.protocol !== "https:") return null;
      if (kind === "img" && !IMG_HOSTS.some(function (re) { return re.test(u.hostname); })) return null;
      return u.toString();
    } catch (e) { return null; }
  }

  function el(tag, props, children) {
    var e = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === "text") e.textContent = props[k];
      else if (k === "class") e.className = props[k];
      else e.setAttribute(k, props[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function money(minor, currency) {
    if (minor === undefined || minor === null) return "—";
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(minor / 100);
    } catch (e) { return String(minor / 100); }
  }

  function productCard(p) {
    var href = safeUrl(p.url, "link");
    var card = el(href ? "a" : "div", { class: "card", href: href || undefined, target: href ? "_blank" : undefined, rel: href ? "noopener" : undefined }, []);
    var imgSrc = safeUrl(p.image, "img");
    if (imgSrc) {
      var img = el("img", { src: imgSrc, alt: "" });
      img.onerror = function () { img.remove(); };
      card.appendChild(img);
    }
    card.appendChild(el("div", { class: "title", text: p.title || "(untitled)" }));
    if (p.brand) card.appendChild(el("div", { class: "brand", text: p.brand }));
    card.appendChild(el("div", { class: "price", text: money(p.priceCents ?? p.priceMinor, p.currency) }));
    if (p.available === false) card.appendChild(el("div", { class: "avail", text: "sold out (as indexed)" }));
    return card;
  }

  function footer(text) {
    return el("div", { class: "footer", text: text || "Stock, final price and delivery are not verified here. Confirm on the merchant page before promising anything to a shopper." });
  }

  function renderSearch(root, data) {
    var hits = data.hits || [];
    if (!hits.length) {
      root.appendChild(el("div", { class: "empty", text: "No products matched \\"" + (data.query || "") + "\\" in the indexed catalog." }));
      return;
    }
    var grid = el("div", { class: "grid" });
    hits.forEach(function (hit) {
      var p = hit.product || hit;
      // hit.url is baked in server-side (canonicalUrl() with attribution) —
      // never reconstruct a merchant URL here, it would drop the ref param.
      grid.appendChild(productCard({
        url: hit.url,
        image: (p.images && p.images[0]) || p.image,
        title: p.title, brand: p.brand,
        priceCents: p.variants && p.variants[0] ? p.variants[0].priceMinor : p.priceCents,
        currency: (p.variants && p.variants[0] && p.variants[0].currency) || p.currency,
      }));
    });
    root.appendChild(grid);
    root.appendChild(footer());
  }

  function renderProduct(root, data) {
    var p = data.product;
    if (!p) { root.appendChild(el("div", { class: "empty", text: "Not indexed." })); return; }
    root.appendChild(el("h2", { class: "pd-title", text: p.title || "(untitled)" }));
    if (p.brand) root.appendChild(el("div", { class: "pd-row brand", text: p.brand }));
    if (p.categories && p.categories.length) root.appendChild(el("div", { class: "pd-row muted", text: p.categories.join(" > ") }));
    if (p.variants && p.variants.length) {
      var table = el("table");
      var head = el("tr", null, [el("th", { text: "SKU" }), el("th", { text: "Price" }), el("th", { text: "Availability" })]);
      table.appendChild(el("thead", null, [head]));
      var body = el("tbody");
      p.variants.slice(0, 20).forEach(function (v) {
        body.appendChild(el("tr", null, [
          el("td", { text: v.skuId || "" }),
          el("td", { text: money(v.priceMinor, v.currency) }),
          el("td", { text: v.available === false ? "sold out (as indexed)" : v.available === true ? "in stock (as indexed)" : "verify live" }),
        ]));
      });
      table.appendChild(body);
      root.appendChild(table);
    }
    if (p.claims && p.claims.length) {
      var ul = el("ul", { class: "claims" });
      p.claims.slice(0, 15).forEach(function (c) {
        ul.appendChild(el("li", { text: (c.predicate || "").replace(/_/g, " ") + ": " + c.value }));
      });
      root.appendChild(ul);
    }
    root.appendChild(footer());
  }

  function render() {
    var root = document.getElementById("root");
    root.textContent = "";
    var data = (window.openai && window.openai.toolOutput) || {};
    if (data.hits) renderSearch(root, data);
    else if (data.product) renderProduct(root, data);
    else if (data.storefronts) {
      var grid = el("div", { class: "grid" });
      (data.storefronts || []).forEach(function (s) {
        grid.appendChild(el("a", { class: "card", href: safeUrl("https://" + s.domain, "link") || undefined, target: "_blank", rel: "noopener" }, [
          el("div", { class: "title", text: s.domain }),
          el("div", { class: "brand", text: (s.product_count || 0) + " products indexed" }),
        ]));
      });
      root.appendChild(grid);
    } else {
      root.appendChild(el("div", { class: "empty", text: "No data." }));
    }
  }

  render();
  window.addEventListener("openai:set_globals", render);
})();
</script>
</body>
</html>`;
