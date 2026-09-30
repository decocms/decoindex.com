/**
 * The inline UI for `traffic_stats` — the operator screen.
 *
 * It answers one question, and the layout is built around it: is agent traffic
 * growing? CLAUDE.md is blunt that reads from openai, anthropic, perplexity and
 * script are the business and browser pageviews are vanity, so that judgement is
 * encoded here rather than left to whoever is reading. Agent classes get the
 * categorical hues; browser, search-engine and unknown are deliberately grey and
 * recessive. The hero number is agent reads, not total reads.
 *
 * Colour was chosen last and computed, not eyeballed. deco's lime (#D0EC1A) is a
 * brand colour and fails as a data colour on paper — OKLCH L 0.892 against a
 * 0.43–0.77 band, 1.3:1 contrast — so it stays on chrome and the hero tile and
 * never fills a mark. The categorical ramp below passed the six checks on a
 * light surface in exactly this order; the order is load-bearing, because
 * adjacent-pair CVD separation was validated pairwise along it. Two steps land
 * under 3:1 against the surface, which obliges visible labels — hence the
 * always-present legend, the direct value labels, and the table view.
 *
 * No React, no bundler, no build step — same plain-template-string pattern as
 * landing.ts. Data is first-party (our own event stream), but the DOM is still
 * built with createElement/textContent rather than innerHTML: merchant domains
 * flow through this, and the rule in CLAUDE.md is not conditional.
 */
export const TRAFFIC_WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{
    --ink:#282524; --muted:#6E6863; --faint:#A6A09D;
    --soft:#5E7500; --green:#D0EC1A; --forest:#07401A;
    --paper:#fff; --paper-2:#FAFAF9; --paper-3:#F6F4F1;
    --hairline:rgba(40,37,36,.09);
    --sans:"Switzer","Helvetica Neue",Helvetica,Arial,sans-serif;
    --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:14px;
    -webkit-font-smoothing:antialiased}
  #root{padding:16px;max-width:900px;margin:0 auto}

  .head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:14px}
  .head h1{font-size:15px;font-weight:500;margin:0;letter-spacing:-.01em}
  .head .win{font-size:12px;color:var(--faint);font-family:var(--mono)}

  /* ---- hero: the one number that matters ---- */
  .hero{background:var(--forest);border-radius:16px;padding:20px 22px;margin-bottom:14px;color:#E7E5E4}
  .hero .label{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--green);margin-bottom:6px}
  .hero .n{font-size:44px;line-height:1;font-weight:400;letter-spacing:-.03em;color:#fff;
    font-variant-numeric:tabular-nums}
  .hero .sub{font-size:13px;color:#E7E5E4;opacity:.75;margin-top:8px;line-height:1.5}

  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:18px}
  .tile{border:1px solid var(--hairline);border-radius:12px;padding:12px 14px;background:var(--paper-2)}
  .tile .k{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
  .tile .v{font-size:22px;margin-top:4px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}

  h2{font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;
    color:var(--muted);margin:0 0 10px}
  .panel{margin-bottom:20px}

  /* ---- stacked daily series ---- */
  .chart{display:flex;align-items:flex-end;gap:6px;height:132px;padding-top:4px;
    border-bottom:1px solid var(--hairline)}
  /* max-width matters more than it looks: over a short window, flex:1 alone
     gives each column ~290px and the stack reads as a solid slab rather than a
     bar chart. Cap the width, keep them left-aligned, and the shape returns. */
  .col{flex:1 1 0;max-width:44px;display:flex;flex-direction:column;justify-content:flex-end;
    gap:2px;height:100%;position:relative;cursor:default;min-width:0}
  /* 4px rounded data-end on the topmost segment only; the stack reads as one bar
     anchored to the baseline, with a 2px surface gap between segments. */
  .seg{border-radius:2px}
  .col .seg:first-child{border-top-left-radius:4px;border-top-right-radius:4px}
  .col:hover .seg{opacity:.72}
  .xlab{display:flex;gap:6px;margin-top:6px}
  .xlab span{flex:1 1 0;max-width:44px;text-align:center;font-size:10px;color:var(--faint);
    font-family:var(--mono);white-space:nowrap;min-width:0}

  /* ---- rankings ---- */
  .rank{display:flex;flex-direction:column;gap:7px}
  .r{display:grid;grid-template-columns:118px 1fr auto;align-items:center;gap:10px}
  .r .name{font-size:12.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .r .track{background:var(--paper-3);border-radius:4px;height:9px;overflow:hidden}
  .r .fill{height:100%;border-radius:4px}
  .r .val{font-size:12px;color:var(--muted);font-family:var(--mono);font-variant-numeric:tabular-nums}

  .legend{display:flex;flex-wrap:wrap;gap:10px 14px;margin-top:12px}
  .lg{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted)}
  .sw{width:10px;height:10px;border-radius:3px;flex:none}

  .cols{display:grid;grid-template-columns:1fr;gap:20px}
  @media(min-width:620px){.cols{grid-template-columns:1fr 1fr;gap:24px}}

  .empty{color:var(--muted);padding:28px 8px;text-align:center;font-size:13px}
  .note{font-size:11.5px;color:var(--faint);line-height:1.5;margin-top:14px;
    border-top:1px solid var(--hairline);padding-top:10px}

  details{margin-top:12px}
  summary{font-size:11.5px;color:var(--muted);cursor:pointer}
  table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}
  th,td{border:1px solid var(--hairline);padding:4px 7px;text-align:left}
  th{background:var(--paper-3);font-weight:500}
  pre.robots{font-family:var(--mono);font-size:11.5px;line-height:1.5;margin:8px 0 0;
    padding:10px 12px;background:var(--paper-3);border:1px solid var(--hairline);
    border-radius:8px;overflow-x:auto;white-space:pre}
  td.n{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums}

  /* ---- controls ---- */
  .bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:12px}
  .segs{display:inline-flex;border:1px solid var(--hairline);border-radius:9px;overflow:hidden;background:var(--paper-2)}
  .segs button{font:inherit;font-size:12px;border:0;background:none;color:var(--muted);padding:6px 11px;
    cursor:pointer;font-family:var(--mono)}
  .segs button+button{border-left:1px solid var(--hairline)}
  .segs button:hover{background:var(--paper-3);color:var(--ink)}
  .segs button.on{background:var(--ink);color:#fff}
  .dates{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--faint)}
  .dates input{font:inherit;font-size:12px;color:var(--ink);border:1px solid var(--hairline);
    border-radius:8px;padding:5px 7px;background:var(--paper)}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
  .chip{font:inherit;font-size:12px;display:inline-flex;gap:6px;align-items:center;max-width:100%;
    border:1px solid var(--hairline);background:var(--paper-3);border-radius:999px;padding:4px 10px;cursor:pointer;color:var(--ink)}
  .chip .ck{color:var(--muted)}
  .chip .cv{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
  .chip:hover{border-color:var(--ink)}
  .chip.clear{background:none;color:var(--muted)}
  button:focus-visible,input:focus-visible,.click:focus-visible{outline:2px solid var(--soft);outline-offset:2px}
  .r.click,.col.click{cursor:pointer}
  .r.click:hover .name{text-decoration:underline}
  .r.wide{grid-template-columns:minmax(0,3fr) minmax(60px,1fr) auto}
  body.loading #root{opacity:.5;pointer-events:none;transition:opacity .15s ease}

  .tip{position:fixed;pointer-events:none;z-index:9;background:var(--ink);color:#fff;
    border-radius:8px;padding:8px 10px;font-size:11.5px;line-height:1.5;opacity:0;
    transition:opacity .12s ease;max-width:220px}
  .tip b{font-weight:500}
  .tip .tr{display:flex;justify-content:space-between;gap:12px}
  @media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div id="root"></div>
<div class="tip" id="tip"></div>
<script>
(function () {
  /**
   * Fixed hue order, validated pairwise in exactly this sequence. Colour follows
   * the entity, never its rank — filtering to fewer classes must not repaint the
   * survivors — so this is a map, not an array index.
   */
  var AGENT_COLOR = {
    openai:          "#2a78d6",
    anthropic:       "#1baf7a",
    perplexity:      "#eda100",
    "google-ai":     "#008300",
    "other-crawler": "#4a3aa7",
    script:          "#e34948"
  };
  /* Not agents. Grey on purpose: they are the vanity metric, present for context
     and never competing for attention with the classes that matter. */
  var OTHER_COLOR = {
    amazonbot: "#6e6863", "amazon-search": "#857f7a", datacenter: "#5b5654",
    "verified-bot": "#a8a29d", browser: "#b9b3ae", "search-engine": "#cbc6c1", unknown: "#dcd8d4"
  };
  var ORDER = ["openai","anthropic","perplexity","google-ai","other-crawler","script",
               "amazonbot","amazon-search","datacenter","verified-bot","browser","search-engine","unknown"];

  function colorFor(k) { return AGENT_COLOR[k] || OTHER_COLOR[k] || "#d8d3ce"; }
  function isAgent(k) { return Object.prototype.hasOwnProperty.call(AGENT_COLOR, k); }

  function el(tag, props, children) {
    var e = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === "text") e.textContent = props[k];
      else if (k === "class") e.className = props[k];
      else if (k === "style") e.setAttribute("style", props[k]);
      else e.setAttribute(k, props[k]);
    }
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function num(n) { return Number(n || 0).toLocaleString("en-US"); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

  // ---- tooltip -------------------------------------------------------------
  var tip = document.getElementById("tip");
  function showTip(html, ev) {
    tip.textContent = "";
    html.forEach(function (n) { tip.appendChild(n); });
    tip.style.opacity = "1";
    var r = tip.getBoundingClientRect();
    var x = Math.min(ev.clientX + 12, window.innerWidth - r.width - 8);
    var y = Math.max(ev.clientY - r.height - 12, 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.style.opacity = "0"; }

  // ---- state: the last result's own query is the source of truth ------------
  //
  // Every control builds its arguments from d.query plus one change and calls
  // the tool again, so the screen can never show filters the data was not
  // computed under.
  var FILTER_KEYS = ["ua_class", "domain", "surface", "country", "network", "bot", "ua", "path"];
  function data() { return window.__DATA__ || (window.openai && window.openai.toolOutput) || {}; }
  function query() { return data().query || { days: data().days || 14 }; }
  function currentFilters() {
    var q = query(), out = {};
    FILTER_KEYS.forEach(function (k) { if (q[k]) out[k] = q[k]; });
    return out;
  }
  function currentRange() {
    var q = query();
    return q.from ? { from: q.from, to: q.to } : { days: q.days || 14 };
  }
  function go(range, filters) {
    var a = {};
    var f = filters || currentFilters();
    for (var k in f) a[k] = f[k];
    if (range.from) { a.from = range.from; if (range.to) a.to = range.to; }
    else a.days = range.days;
    load(a);
  }
  function setFilter(k, v) {
    var f = currentFilters();
    if (v == null) delete f[k]; else f[k] = String(v);
    go(currentRange(), f);
  }

  /**
   * One call, three transports. Apps SDK first (window.openai.callTool), then
   * the MCP Apps host over postMessage, and outside any host the query string
   * is the state: /mcp/ui reads it server-side, so a reload re-runs the tool.
   */
  function load(args) {
    document.body.classList.add("loading");
    function done(r) {
      document.body.classList.remove("loading");
      if (!adopt(r)) render();
    }
    if (window.openai && typeof window.openai.callTool === "function") {
      window.openai.callTool("traffic_stats", args).then(done, done);
    } else if (host) {
      request("tools/call", { name: "traffic_stats", arguments: args }, done);
    } else {
      var p = new URLSearchParams(location.search), keep = new URLSearchParams();
      if (p.get("token")) keep.set("token", p.get("token"));
      for (var k in args) if (args[k] != null) keep.set(k, String(args[k]));
      location.search = keep.toString();
    }
  }

  // ---- stacked time series ---------------------------------------------------
  function series(root, d) {
    var rows = d.byTime || d.byDay || [];
    if (!rows.length) return;
    var hourly = d.bucket === "hour";
    var step = hourly ? 3600000 : 86400000;
    var len = hourly ? 13 : 10;
    function key(ms) { return new Date(ms).toISOString().slice(0, len); }
    var index = {};
    rows.forEach(function (r) {
      var t = r.t || r.day;
      if (!index[t]) index[t] = { t: t, classes: {}, total: 0 };
      index[t].classes[r.ua_class || "unknown"] = Number(r.n || 0);
      index[t].total += Number(r.n || 0);
    });

    /**
     * Fill the whole window, including empty buckets.
     *
     * A bucket with zero reads is a real observation, not a missing category.
     * Drop it and the bars close ranks, so a fortnight with three active days
     * draws three adjacent bars and reads as continuous activity — the axis
     * lies about exactly the thing this panel exists to show.
     */
    var start = Date.parse(key(Date.parse(d.since)) + (hourly ? ":00:00Z" : "T00:00:00Z"));
    var end = Date.parse(d.until || new Date().toISOString());
    var buckets = [];
    for (var t = start; t < end && buckets.length < 200; t += step) {
      buckets.push(index[key(t)] || { t: key(t), classes: {}, total: 0 });
    }
    var peak = buckets.reduce(function (m, b) { return Math.max(m, b.total); }, 0) || 1;
    var dense = buckets.length > 40;

    var panel = el("div", { class: "panel" }, [
      el("h2", { text: hourly ? "Reads per hour (UTC)" : "Reads per day — click a day for its hours" })
    ]);
    var chart = el("div", { class: "chart", style: dense ? "gap:2px" : "" });

    buckets.forEach(function (b) {
      var col = el("div", { class: "col" + (hourly ? "" : " click") });
      // Agent classes first down the stack so the rounded cap sits on the top
      // segment and they stay adjacent to each other rather than to the greys.
      ORDER.concat(Object.keys(b.classes).filter(function (k) { return ORDER.indexOf(k) < 0; }))
        .forEach(function (k) {
          var v = b.classes[k];
          if (!v) return;
          col.appendChild(el("div", {
            class: "seg",
            style: "background:" + colorFor(k) + ";height:" + (v / peak) * 100 + "%;min-height:2px"
          }));
        });
      col.addEventListener("mousemove", function (ev) {
        var tips = [el("b", { text: hourly ? b.t.replace("T", " ") + ":00" : b.t })];
        Object.keys(b.classes).sort(function (x, y) { return b.classes[y] - b.classes[x]; })
          .forEach(function (k) {
            tips.push(el("div", { class: "tr" }, [el("span", { text: k }), el("span", { text: num(b.classes[k]) })]));
          });
        tips.push(el("div", { class: "tr", style: "margin-top:4px;opacity:.7" }, [
          el("span", { text: "total" }), el("span", { text: num(b.total) })
        ]));
        showTip(tips, ev);
      });
      col.addEventListener("mouseleave", hideTip);
      if (!hourly) col.addEventListener("click", function () { hideTip(); go({ from: b.t, to: b.t }); });
      chart.appendChild(col);
    });

    panel.appendChild(chart);
    // Label every column while they fit, then thin out to roughly six ticks.
    var labels = el("div", { class: "xlab", style: dense ? "gap:2px" : "" });
    var every = Math.ceil(buckets.length / 6);
    buckets.forEach(function (b, i) {
      var show = buckets.length <= 8 || i % every === 0 || i === buckets.length - 1;
      var text = hourly ? b.t.slice(11) + "h" : b.t.slice(5);
      labels.appendChild(el("span", { text: show ? text : "" }));
    });
    panel.appendChild(labels);
    root.appendChild(panel);
  }

  // ---- horizontal rankings ---------------------------------------------------
  //
  // opts.filter names the traffic_stats filter a row sets when clicked. Rows
  // whose value was never recorded are shown but not clickable: there is no
  // value to filter by, and "(not recorded)" as a filter would match nothing.
  function ranking(title, rows, key, opts) {
    opts = opts || {};
    var panel = el("div", { class: "panel" }, [el("h2", { text: title })]);
    if (!rows || !rows.length) {
      panel.appendChild(el("div", { class: "empty", text: "Nothing yet." }));
      return panel;
    }
    var peak = rows.reduce(function (m, r) { return Math.max(m, Number(r.n || 0)); }, 0) || 1;
    var list = el("div", { class: "rank" });
    rows.slice(0, opts.limit || 8).forEach(function (r) {
      var raw = r[key];
      var name = raw == null ? "(not recorded)" : opts.label ? opts.label(r) : String(raw);
      var v = Number(r.n || 0);
      var clickable = opts.filter && raw != null && query()[opts.filter] !== String(raw);
      var fill = el("div", {
        class: "fill",
        style: "width:" + Math.max((v / peak) * 100, 1.5) + "%;background:" +
               (opts.color ? opts.color(String(raw)) : "#2a78d6")
      });
      var row = el("div", { class: "r" + (opts.wide ? " wide" : "") + (clickable ? " click" : "") }, [
        el("div", { class: "name", title: name, text: name }),
        el("div", { class: "track" }, [fill]),
        el("div", { class: "val", text: num(v) })
      ]);
      row.addEventListener("mousemove", function (ev) {
        showTip([el("b", { text: name }), el("div", { class: "tr" }, [
          el("span", { text: "reads" }), el("span", { text: num(v) + " · " + pct(v, data().total) + "%" })
        ]), clickable ? el("div", { style: "opacity:.7;margin-top:4px", text: "click to filter" }) : null], ev);
      });
      row.addEventListener("mouseleave", hideTip);
      if (clickable) row.addEventListener("click", function () { hideTip(); setFilter(opts.filter, raw); });
      list.appendChild(row);
    });
    panel.appendChild(list);
    return panel;
  }

  function table(caption, rows, key) {
    var d = el("details");
    d.appendChild(el("summary", { text: caption }));
    var t = el("table");
    t.appendChild(el("thead", null, [el("tr", null, [
      el("th", { text: key }), el("th", { text: "reads" })
    ])]));
    var tb = el("tbody");
    (rows || []).forEach(function (r) {
      tb.appendChild(el("tr", null, [
        el("td", { text: String(r[key] == null ? "(none)" : r[key]) }),
        el("td", { class: "n", text: num(r.n) })
      ]));
    });
    t.appendChild(tb);
    d.appendChild(t);
    return d;
  }

  // ---- range + filter controls -----------------------------------------------
  function controls(d) {
    var q = query();
    var today = new Date().toISOString().slice(0, 10);
    var bar = el("div", { class: "bar" });

    var segs = el("div", { class: "segs", role: "group", "aria-label": "Date range" });
    [1, 7, 14, 30, 90].forEach(function (n) {
      var on = !q.from && Number(q.days) === n;
      var b = el("button", { type: "button", class: on ? "on" : "", "aria-pressed": String(on), text: n + "d" });
      b.addEventListener("click", function () { go({ days: n }); });
      segs.appendChild(b);
    });
    bar.appendChild(segs);

    var from = el("input", { type: "date", "aria-label": "From", max: today,
      value: q.from || String(d.since || "").slice(0, 10) });
    var to = el("input", { type: "date", "aria-label": "To", max: today, value: q.to || today });
    function apply() { if (from.value && to.value && from.value <= to.value) go({ from: from.value, to: to.value }); }
    from.addEventListener("change", apply);
    to.addEventListener("change", apply);
    bar.appendChild(el("div", { class: "dates" }, [from, el("span", { text: "→" }), to]));
    return bar;
  }

  function chips() {
    var f = currentFilters();
    var keys = Object.keys(f);
    if (!keys.length) return null;
    var row = el("div", { class: "chips" });
    keys.forEach(function (k) {
      var b = el("button", { type: "button", class: "chip", title: "Remove filter" }, [
        el("span", { class: "ck", text: k }), el("span", { class: "cv", text: f[k] }), el("span", { text: "×" })
      ]);
      b.addEventListener("click", function () { setFilter(k, null); });
      row.appendChild(b);
    });
    if (keys.length > 1) {
      var clear = el("button", { type: "button", class: "chip clear", text: "Clear all" });
      clear.addEventListener("click", function () { go(currentRange(), {}); });
      row.appendChild(clear);
    }
    return row;
  }

  function render() {
    var root = document.getElementById("root");
    root.textContent = "";
    var d = data();

    if (!d.byAgent) {
      // Inside a host frame, "no data" almost always means the handshake has not
      // completed yet, and saying "no traffic" there reads as a broken service
      // rather than a pending one.
      root.appendChild(el("div", {
        class: "empty",
        text: window.parent === window
          ? "No traffic data."
          : "Waiting for the host to deliver traffic_stats…",
      }));
      return;
    }

    var total = Number(d.total || 0);
    var agents = Number(d.agentReads || 0);
    var q = query();
    var win = q.from ? q.from + (q.to && q.to !== q.from ? " → " + q.to : "") : "last " + (q.days || 14) + "d";

    root.appendChild(el("div", { class: "head" }, [
      el("h1", { text: "decoindex traffic" }),
      el("span", { class: "win", text: win })
    ]));
    root.appendChild(controls(d));
    var c = chips();
    if (c) root.appendChild(c);

    root.appendChild(el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Agent reads" }),
      el("div", { class: "n", text: num(agents) }),
      el("div", {
        class: "sub",
        text: agents + total === 0
          ? "No reads in this window."
          : pct(agents, total) + "% of " + num(total) + " reads. " +
            "Browser pageviews are vanity — this is the number that moves the business."
      })
    ]));

    var cacheRows = d.byCache || [];
    var served = cacheRows.reduce(function (s, r) { return s + Number(r.n || 0); }, 0);
    var fromCache = cacheRows
      .filter(function (r) { return r.cache === "edge" || r.cache === "kv"; })
      .reduce(function (s, r) { return s + Number(r.n || 0); }, 0);

    root.appendChild(el("div", { class: "tiles" }, [
      el("div", { class: "tile" }, [
        el("div", { class: "k", text: "Total reads" }), el("div", { class: "v", text: num(total) })
      ]),
      el("div", { class: "tile" }, [
        el("div", { class: "k", text: "Storefronts" }),
        el("div", { class: "v", text: num((d.byDomain || []).length) })
      ]),
      el("div", { class: "tile" }, [
        el("div", { class: "k", text: "Served warm" }),
        el("div", { class: "v", text: served ? pct(fromCache, served) + "%" : "—" })
      ]),
      el("div", { class: "tile" }, [
        el("div", { class: "k", text: "Refused (403)" }),
        el("div", { class: "v", text: num(d.blocked) })
      ])
    ]));

    series(root, d);

    var blue = function () { return "#2a78d6"; };
    var violet = function () { return "#4a3aa7"; };
    var grey = function () { return "#9a948f"; };

    root.appendChild(el("div", { class: "cols" }, [
      ranking("By agent", d.byAgent, "ua_class", { color: colorFor, limit: 12, filter: "ua_class" }),
      ranking("By surface", d.bySurface, "surface", { color: violet, filter: "surface" })
    ]));
    root.appendChild(ranking("Top storefronts", d.byDomain, "domain", { color: blue, limit: 10, filter: "domain" }));
    root.appendChild(el("div", { class: "cols" }, [
      ranking("Networks", d.byNetwork, "network", {
        color: grey, limit: 10, filter: "network",
        label: function (r) { return r.network + (r.asn ? " · AS" + r.asn : ""); }
      }),
      ranking("Countries", d.byCountry, "country", { color: grey, limit: 10, filter: "country" })
    ]));
    root.appendChild(el("div", { class: "cols" }, [
      ranking("Cloudflare verified bot", d.byBot, "bot", { color: grey, filter: "bot" }),
      ranking("Served from", d.byCache, "cache", { color: grey })
    ]));
    root.appendChild(ranking("User agents", d.byUa, "ua", { color: grey, limit: 15, filter: "ua", wide: true }));
    root.appendChild(ranking("Paths", d.byPath, "path", { color: blue, limit: 15, filter: "path", wide: true }));

    // Identity is never colour-alone: the legend is always present, and the
    // table view underneath covers the two ramp steps that sit under 3:1.
    var legend = el("div", { class: "legend" });
    (d.byAgent || []).map(function (r) { return r.ua_class || "unknown"; })
      .sort(function (a, b) { return (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99; })
      .forEach(function (k) {
        legend.appendChild(el("div", { class: "lg" }, [
          el("span", { class: "sw", style: "background:" + colorFor(k) }),
          el("span", { text: k + (isAgent(k) ? "" : " (not an agent)") })
        ]));
      });
    root.appendChild(legend);

    root.appendChild(table("Table view — by agent", d.byAgent, "ua_class"));

    // The blocklist: what the hourly sweep (and we, by hand) refuse, with the
    // evidence it was refused on. Open by default when a rule is new, because an
    // automated block is exactly the thing an operator should see happen.
    var rules = d.blocklist || [];
    var bl = el("details");
    if (rules.some(function (r) { return Date.now() - Date.parse(r.created_at) < 86400000; })) bl.open = true;
    bl.appendChild(el("summary", { text: "Blocklist — " + rules.length + " active rule" + (rules.length === 1 ? "" : "s") +
      ", " + num(d.blockedNamed) + " refused by name in this window" }));
    if (rules.length) {
      var bt = el("table");
      bt.appendChild(el("thead", null, [el("tr", null, ["source", "network", "user agent", "why", "until", "refused"]
        .map(function (h) { return el("th", { text: h }); }))]));
      var bb = el("tbody");
      rules.forEach(function (r) {
        bb.appendChild(el("tr", null, [
          el("td", { text: r.source }),
          el("td", { text: (r.aso || "any") + (r.asn ? " · AS" + r.asn : "") }),
          el("td", { text: r.ua, style: "word-break:break-all" }),
          el("td", { text: r.reason }),
          el("td", { text: r.expires_at ? String(r.expires_at).slice(0, 10) : "permanent" }),
          el("td", { class: "n", text: num(r.blocked) })
        ]));
      });
      bt.appendChild(bb);
      bl.appendChild(el("div", { style: "overflow-x:auto" }, [bt]));
    }
    root.appendChild(bl);

    if (d.robots) {
      var rb = el("details");
      rb.appendChild(el("summary", { text: "robots.txt — what crawlers are told" }));
      rb.appendChild(el("pre", { class: "robots", text: String(d.robots) }));
      root.appendChild(rb);
    }

    root.appendChild(el("div", {
      class: "note",
      text: "Reads of decoindex documents from " + String(d.since || "").slice(0, 16).replace("T", " ") +
            " UTC. A read is one document served, from the edge, from KV, or resolved live. " +
            "Network, user agent, verified bot and path are recorded from 2026-09-30; " +
            "earlier reads show as (not recorded)."
    }));
  }

  /**
   * Three hosts, three ways in, one render().
   *
   * - window.__DATA__   GET /mcp/ui inlines the tool result server-side.
   * - window.openai     OpenAI Apps SDK injects toolOutput on the global.
   * - postMessage       deco Studio implements MCP Apps: the iframe is itself an
   *                     MCP client speaking JSON-RPC to window.parent.
   *
   * The Studio handshake is not "send ui/initialize and start working". Read off
   * the ext-apps client a working app ships:
   *
   *   1. request  ui/initialize            -> host replies with hostInfo/caps
   *   2. notify   ui/notifications/initialized
   *   3. only then may the app call tools
   *
   * Step 2 is the one that matters and the one this was missing. The host holds
   * its loading state until that notification arrives, so an app that sends the
   * request and goes straight to tools/call renders "loading" forever while
   * looking, from the app side, like it connected fine.
   *
   * The host also *sends* requests, "ping" at minimum. Leaving those unanswered
   * strands the host waiting on a reply, so anything addressed to us gets a
   * response: {} for ping, a proper JSON-RPC error for anything unrecognised.
   * Silence is the one thing a request must never get.
   */
  var PROTOCOL = "2026-01-26";
  var nextId = 1;
  var pending = {};
  var host = window.parent !== window ? window.parent : null;

  function post(msg) {
    if (!host) return;
    try { host.postMessage(msg, "*"); } catch (e) { /* frame gone */ }
  }
  function request(method, params, onResult) {
    var id = nextId++;
    pending[id] = onResult || function () {};
    post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
  }
  function notify(method, params) {
    post({ jsonrpc: "2.0", method: method, params: params || {} });
  }

  function adopt(payload) {
    if (!payload) return false;
    // structuredContent is where traffic_stats' object lives; hosts differ on
    // whether they hand over the result or the whole envelope.
    var data = payload.structuredContent || payload.toolResult || payload;
    if (data && data.structuredContent) data = data.structuredContent;
    if (!data || !data.byAgent) return false;
    window.__DATA__ = data;
    render();
    return true;
  }

  window.addEventListener("message", function (ev) {
    // The transport on the other side filters by source; match it, so a message
    // from some other frame on the page cannot drive this app.
    if (host && ev.source !== host) return;
    var msg = ev.data;
    if (!msg || msg.jsonrpc !== "2.0") return;

    // A reply to something we asked.
    if (msg.id !== undefined && msg.id !== null && pending[msg.id]) {
      var cb = pending[msg.id];
      delete pending[msg.id];
      cb(msg.result, msg.error);
      return;
    }
    // A request *from* the host. Must be answered, always.
    if (typeof msg.method === "string" && msg.id !== undefined && msg.id !== null) {
      if (msg.method === "ping") post({ jsonrpc: "2.0", id: msg.id, result: {} });
      else post({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: "Method not found: " + msg.method },
      });
      return;
    }
    // A notification. Tool results may be pushed rather than returned.
    if (typeof msg.method === "string" && msg.method.indexOf("tool-result") !== -1) {
      adopt(msg.params);
    }
  });

  render();
  window.addEventListener("openai:set_globals", render);

  if (host) {
    request(
      "ui/initialize",
      {
        appInfo: { name: "decoindex-traffic", version: "1.0.0" },
        appCapabilities: {},
        protocolVersion: PROTOCOL,
      },
      function (result, error) {
        if (error) return;
        // Completes the handshake. Until this lands the host stays on its
        // loading state no matter what else the app does.
        notify("ui/notifications/initialized");
        // Fetch our own data rather than waiting to be handed it: the host only
        // pushes a tool-result when the user invoked the tool, and opening the
        // view from the sidebar does not.
        load({ days: 14 });
      },
    );
  }
})();
</script>
</body>
</html>`;
