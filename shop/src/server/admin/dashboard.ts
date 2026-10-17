/**
 * The admin screen, one HTML document for three hosts (see mcp.ts). Every value
 * from the data is shopper-typed text or derived from it, so the DOM is built
 * with createElement/textContent only — never innerHTML with data.
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>deco shop · admin</title>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap">
<style>
  :root { --ink:#0a0a0a; --soft:#737373; --line:#e5e5e5; --bg:#fff; --card:#fafafa; --lime:#d4f01f; --green:#0b3d1c; --sale:#c0362c; }
  * { box-sizing: border-box; }
  body { margin:0; font: 14px/1.4 Switzer, ui-sans-serif, system-ui, sans-serif; color: var(--ink); background: var(--bg); -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 20px 20px 48px; }
  header { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; }
  h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; margin: 0; display:flex; gap:8px; align-items:center; }
  .pill { font-size: 9px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; background: var(--lime); color: var(--green); padding: 3px 7px; border-radius: 99px; }
  .seg { display:flex; gap:2px; border:1px solid var(--line); border-radius: 99px; padding: 2px; }
  .seg button { border:0; background:transparent; padding:6px 12px; border-radius:99px; cursor:pointer; font:inherit; color: var(--soft); }
  .seg button.on { background: var(--ink); color:#fff; }
  input[type=search] { font: inherit; border:1px solid var(--line); border-radius: 99px; padding: 7px 14px; min-width: 220px; outline: none; }
  input[type=search]:focus { border-color: var(--ink); }
  .kpis { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 20px 0; }
  .kpi { background: var(--card); border-radius: 12px; padding: 14px 16px; }
  .kpi .v { font-size: 26px; font-weight: 600; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .kpi .l { font-size: 11px; color: var(--soft); text-transform: uppercase; letter-spacing: .08em; margin-top: 2px; }
  h2 { font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--soft); margin: 28px 0 10px; }
  table { width:100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { text-align:left; font-weight:500; color: var(--soft); font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  td { padding: 9px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr.best td:first-child::after { content: "melhor CTR"; margin-left: 8px; font-size: 9px; font-weight:600; background: var(--lime); color: var(--green); padding: 2px 6px; border-radius: 99px; text-transform: uppercase; letter-spacing:.06em; }
  .bars { display:flex; align-items:flex-end; gap: 3px; height: 110px; padding-top: 6px; }
  .bar { flex:1; background: #e8e8e8; border-radius: 4px 4px 0 0; position: relative; min-width: 6px; }
  .bar i { position:absolute; left:0; right:0; bottom:0; background: var(--ink); border-radius: 4px 4px 0 0; }
  .bar span { position:absolute; bottom:-18px; left:50%; transform: translateX(-50%); font-size: 10px; color: var(--soft); white-space: nowrap; }
  .legend { font-size: 11px; color: var(--soft); margin-top: 24px; }
  .cols { display:grid; grid-template-columns: 1.6fr 1fr; gap: 28px; }
  .cols3 { display:grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
  @media (max-width: 820px) { .cols3 { grid-template-columns: 1fr; } }
  @media (max-width: 820px) { .cols { grid-template-columns: 1fr; } }
  .q { font-weight: 500; }
  .meta { color: var(--soft); font-size: 12px; margin-top: 2px; display:flex; gap:8px; flex-wrap: wrap; }
  .tag { font-size: 11px; border: 1px solid var(--line); border-radius: 99px; padding: 0 7px; }
  .clicks { font-weight: 600; color: var(--green); background: #eefbc4; border-radius: 99px; padding: 0 7px; font-size: 12px; }
  .err { color: var(--sale); }
  a { color: inherit; }
  .row { display:flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .hbar { height: 6px; background: var(--ink); border-radius: 99px; margin-top: 4px; }
  .empty { color: var(--soft); padding: 18px 0; }
  .loading { color: var(--soft); padding: 40px 0; text-align: center; }
</style>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  var root = document.getElementById("root");
  var state = { days: 7, q: "" };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function fmtMs(ms) { return ms == null ? "–" : (ms / 1000).toFixed(1) + "s"; }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + "%" : "–"; }
  function short(m) { return m ? String(m).split("/").pop() : "–"; }
  function when(ts) { try { return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ts; } }

  function data() { return window.__DATA__ || (window.openai && window.openai.toolOutput) || null; }

  function render() {
    var d = data();
    root.textContent = "";
    var wrap = el("div", { class: "wrap" });
    root.appendChild(wrap);

    var seg = el("div", { class: "seg" }, [1, 7, 30, 90].map(function (n) {
      return el("button", { class: state.days === n ? "on" : "", text: n === 1 ? "24h" : n + "d", onclick: function () { state.days = n; load(); } });
    }));
    var search = el("input", { type: "search", placeholder: "Filtrar buscas…", value: state.q });
    search.addEventListener("keydown", function (e) { if (e.key === "Enter") { state.q = search.value.trim(); load(); } });
    wrap.appendChild(el("header", null, [
      el("h1", null, ["deco shop", el("span", { class: "pill", text: "admin" })]),
      el("div", { style: "display:flex;gap:10px;flex-wrap:wrap" }, [search, seg]),
    ]));

    if (!d) { wrap.appendChild(el("p", { class: "loading", text: "Carregando…" })); return; }
    if (d.days) state.days = d.days;

    var t = d.totals || {};
    var models = d.models || [];
    var chats = models.reduce(function (s, m) { return s + (m.chats || 0); }, 0);
    var clicked = models.reduce(function (s, m) { return s + (m.chatsClicked || 0); }, 0);
    var up = models.reduce(function (s, m) { return s + (m.up || 0); }, 0);
    var fb = models.reduce(function (s, m) { return s + (m.up || 0) + (m.down || 0); }, 0);
    wrap.appendChild(el("div", { class: "kpis" }, [
      ["Buscas", t.turns || 0], ["Conversas", chats], ["Conversas com clique", pct(clicked, chats)],
      ["Cliques p/ lojas", t.clicks || 0], ["Mais como este", t.similar || 0], ["Compartilhados", t.shares || 0], ["👍", pct(up, fb)],
    ].map(function (k) { return el("div", { class: "kpi" }, [el("div", { class: "v", text: String(k[1]) }), el("div", { class: "l", text: k[0] })]); })));

    // Traffic: people vs link previews vs bots, and where people come from.
    var tr = d.traffic;
    if (tr) {
      wrap.appendChild(el("h2", { text: "Tráfego" }));
      wrap.appendChild(el("div", { class: "kpis" }, [
        ["Visitas (pessoas)", tr.people], ["Home", tr.kinds.home], ["Links de busca abertos", tr.kinds.share],
        ["Visita → busca", pct(t.turns || 0, tr.people)], ["Previews de link", tr.previews], ["Bots", tr.bots],
      ].map(function (k) { return el("div", { class: "kpi" }, [el("div", { class: "v", text: String(k[1]) }), el("div", { class: "l", text: k[0] })]); })));
      var list = function (title, rows, label, empty) {
        var box = el("div", null, [el("h2", { text: title })]);
        if (!rows.length) box.appendChild(el("p", { class: "empty", text: empty }));
        rows.forEach(function (r) { box.appendChild(el("div", { class: "row" }, [el("span", { text: label(r) }), el("span", { class: "meta", text: String(r.n) })])); });
        return box;
      };
      wrap.appendChild(el("div", { class: "cols3" }, [
        list("De onde vêm", tr.refs || [], function (r) { return r.ref; }, "Sem visitas ainda."),
        list("Países", tr.countries || [], function (r) { return r.country || "?"; }, "–"),
        list("Bots e previews", tr.botAgents || [], function (r) { return (r.cls === "preview" ? "preview · " : "bot · ") + String(r.ua || "(sem UA)").slice(0, 48); }, "Nenhum."),
      ]));
    }

    // Models: the comparison CHAT_MODELS exists for.
    wrap.appendChild(el("h2", { text: "Modelos" }));
    if (!models.length) wrap.appendChild(el("p", { class: "empty", text: "Sem conversas no período." }));
    else {
      var best = models.slice().sort(function (a, b) { return (b.chatsClicked / (b.chats || 1)) - (a.chatsClicked / (a.chats || 1)); })[0];
      wrap.appendChild(el("table", null, [
        el("thead", null, [el("tr", null, ["Modelo", "Buscas", "Conversas", "Latência", "Resultados", "CTR", "👍 / 👎", "Erros"].map(function (h) { return el("th", { text: h }); }))]),
        el("tbody", null, models.map(function (m) {
          return el("tr", { class: models.length > 1 && m === best && m.chatsClicked ? "best" : "" }, [
            short(m.model), m.turns, m.chats, fmtMs(m.avgMs), m.avgHits == null ? "–" : m.avgHits, pct(m.chatsClicked, m.chats), (m.up || 0) + " / " + (m.down || 0), m.errors || 0,
          ].map(function (v) { return el("td", { text: String(v) }); }));
        })),
      ]));
    }

    // Daily volume, clicks as the dark inner bar.
    var daily = d.daily || [];
    if (daily.length) {
      wrap.appendChild(el("h2", { text: "Por dia" }));
      var max = Math.max.apply(null, daily.map(function (x) { return x.turns || 0; }).concat([1]));
      wrap.appendChild(el("div", { class: "bars" }, daily.map(function (x) {
        var b = el("div", { class: "bar", title: x.day + ": " + x.turns + " buscas, " + x.clicks + " cliques", style: "height:" + Math.max(4, (x.turns / max) * 100) + "%" });
        b.appendChild(el("i", { style: "height:" + (x.turns ? Math.min(100, (x.clicks / x.turns) * 100) : 0) + "%" }));
        b.appendChild(el("span", { text: x.day.slice(5) }));
        return b;
      })));
      wrap.appendChild(el("p", { class: "legend", text: "Barra = buscas no dia · parte escura = proporção de cliques" }));
    }

    var left = el("div");
    var right = el("div");
    wrap.appendChild(el("div", { class: "cols" }, [left, right]));

    left.appendChild(el("h2", { text: d.q ? "Buscas com “" + d.q + "”" : "Buscas recentes" }));
    var recent = d.recent || [];
    if (!recent.length) left.appendChild(el("p", { class: "empty", text: "Nenhuma busca no período." }));
    recent.forEach(function (r) {
      var meta = el("div", { class: "meta" }, [
        el("span", { text: when(r.ts) }),
        r.dept ? el("span", { class: "tag", text: r.dept }) : null,
        el("span", { text: short(r.model) }),
        el("span", { text: fmtMs(r.ms) }),
        el("span", { text: (r.hits || 0) + " resultados" }),
        r.clicks ? el("span", { class: "clicks", text: r.clicks + " clique" + (r.clicks > 1 ? "s" : "") }) : null,
        r.error ? el("span", { class: "err", text: "erro" }) : null,
        r.store ? el("span", { class: "tag", text: "via " + r.store }) : null,
        r.share && /^[0-9A-Za-z]{8}$/.test(r.share) ? el("a", { href: "https://shop.decoindex.com/s/" + r.share, target: "_blank", rel: "noopener", text: "ver resultado ↗" }) : null,
      ]);
      left.appendChild(el("div", { class: "row", style: "display:block" }, [el("div", { class: "q", text: r.q || "(sem texto)" }), meta]));
    });

    right.appendChild(el("h2", { text: "Mais buscadas" }));
    var top = d.top || [];
    if (!top.length) right.appendChild(el("p", { class: "empty", text: "–" }));
    top.forEach(function (x) {
      right.appendChild(el("div", { class: "row" }, [
        el("a", { href: "#", text: x.q, onclick: function (e) { e.preventDefault(); state.q = x.q; load(); } }),
        el("span", { class: "meta", text: x.n + "×" }),
      ]));
    });

    right.appendChild(el("h2", { text: "Marcas mais clicadas" }));
    var brands = d.brands || [];
    if (!brands.length) right.appendChild(el("p", { class: "empty", text: "–" }));
    var bmax = Math.max.apply(null, brands.map(function (b) { return b.clicks; }).concat([1]));
    brands.forEach(function (b) {
      right.appendChild(el("div", { style: "padding:6px 0" }, [
        el("div", { class: "row", style: "border:0;padding:0" }, [el("span", { text: String(b.domain).replace(/^www\\./, "") }), el("span", { class: "meta", text: String(b.clicks) })]),
        el("div", { class: "hbar", style: "width:" + (b.clicks / bmax) * 100 + "%" }),
      ]));
    });
  }

  // One call, three transports: Apps SDK, MCP Apps over postMessage, or the query string outside any host.
  function load() {
    var args = { days: state.days };
    if (state.q) args.q = state.q;
    window.__DATA__ = null;
    render();
    if (window.openai && typeof window.openai.callTool === "function") {
      window.openai.callTool("shop_dashboard", args).then(adopt, render);
    } else if (host) {
      request("tools/call", { name: "shop_dashboard", arguments: args }, function (res) { adopt(res); });
    } else {
      var u = new URL(location.href);
      u.searchParams.set("days", String(state.days));
      if (state.q) u.searchParams.set("q", state.q); else u.searchParams.delete("q");
      location.href = u.toString();
    }
  }

  function adopt(payload) {
    if (!payload) return;
    var d = payload.structuredContent || payload.toolResult || payload;
    if (d && d.structuredContent) d = d.structuredContent;
    if (!d || !d.totals) return;
    window.__DATA__ = d;
    render();
  }

  // MCP Apps (deco Studio): request ui/initialize, then NOTIFY ui/notifications/initialized,
  // only then call tools; and answer every request the host sends (ping at least).
  var host = window.parent !== window ? window.parent : null;
  var nextId = 1, pending = {};
  function post(m) { if (host) try { host.postMessage(m, "*"); } catch (e) {} }
  function request(method, params, cb) { var id = nextId++; pending[id] = cb || function () {}; post({ jsonrpc: "2.0", id: id, method: method, params: params || {} }); }
  window.addEventListener("message", function (ev) {
    if (host && ev.source !== host) return;
    var m = ev.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending[m.id]) { var cb = pending[m.id]; delete pending[m.id]; cb(m.result, m.error); return; }
    if (typeof m.method === "string" && m.id != null) {
      post(m.method === "ping" ? { jsonrpc: "2.0", id: m.id, result: {} } : { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found: " + m.method } });
      return;
    }
    if (typeof m.method === "string" && m.method.indexOf("tool-result") !== -1) adopt(m.params);
  });

  var q0 = new URLSearchParams(location.search);
  if (q0.get("q")) state.q = q0.get("q");
  render();
  window.addEventListener("openai:set_globals", render);
  if (host) {
    request("ui/initialize", { appInfo: { name: "decoshop-admin", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" }, function (res, err) {
      if (err) return;
      post({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
      load();
    });
  }
})();
</script>
</body>
</html>`;
