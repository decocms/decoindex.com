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
  td.n{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums}

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
  var OTHER_COLOR = { browser: "#9a948f", "search-engine": "#bdb7b2", unknown: "#d8d3ce" };
  var ORDER = ["openai","anthropic","perplexity","google-ai","other-crawler","script",
               "browser","search-engine","unknown"];

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

  // ---- daily stacked series ------------------------------------------------
  function series(root, byDay) {
    if (!byDay || !byDay.length) return;
    var days = [], index = {};
    byDay.forEach(function (r) {
      var d = r.day;
      if (!index[d]) { index[d] = { day: d, classes: {}, total: 0 }; days.push(index[d]); }
      index[d].classes[r.ua_class || "unknown"] = Number(r.n || 0);
      index[d].total += Number(r.n || 0);
    });
    var peak = days.reduce(function (m, d) { return Math.max(m, d.total); }, 0) || 1;

    var panel = el("div", { class: "panel" }, [el("h2", { text: "Reads per day" })]);
    var chart = el("div", { class: "chart" });

    days.forEach(function (d) {
      var col = el("div", { class: "col" });
      // Tallest-first down the stack so the rounded cap sits on the top segment
      // and agent classes stay adjacent to each other rather than to the greys.
      ORDER.forEach(function (k) {
        var v = d.classes[k];
        if (!v) return;
        var h = (v / peak) * 100;
        col.appendChild(el("div", {
          class: "seg",
          style: "background:" + colorFor(k) + ";height:" + h + "%;min-height:2px"
        }));
      });
      col.addEventListener("mousemove", function (ev) {
        var rows = [el("b", { text: d.day })];
        ORDER.forEach(function (k) {
          if (!d.classes[k]) return;
          rows.push(el("div", { class: "tr" }, [
            el("span", { text: k }), el("span", { text: num(d.classes[k]) })
          ]));
        });
        rows.push(el("div", { class: "tr", style: "margin-top:4px;opacity:.7" }, [
          el("span", { text: "total" }), el("span", { text: num(d.total) })
        ]));
        showTip(rows, ev);
      });
      col.addEventListener("mouseleave", hideTip);
      chart.appendChild(col);
    });

    panel.appendChild(chart);
    // Label every column while they fit, then thin out to roughly six ticks.
    // Labelling only the ends reads as broken when there are three bars.
    var labels = el("div", { class: "xlab" });
    var step = Math.ceil(days.length / 6);
    days.forEach(function (d, i) {
      var show = days.length <= 8 || i % step === 0 || i === days.length - 1;
      labels.appendChild(el("span", { text: show ? d.day.slice(5) : "" }));
    });
    panel.appendChild(labels);
    root.appendChild(panel);
  }

  // ---- horizontal rankings -------------------------------------------------
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
      var name = String(r[key] == null ? "(none)" : r[key]);
      var v = Number(r.n || 0);
      var fill = el("div", {
        class: "fill",
        style: "width:" + Math.max((v / peak) * 100, 1.5) + "%;background:" +
               (opts.color ? opts.color(name) : "#2a78d6")
      });
      var row = el("div", { class: "r" }, [
        el("div", { class: "name", title: name, text: name }),
        el("div", { class: "track" }, [fill]),
        el("div", { class: "val", text: num(v) })
      ]);
      row.addEventListener("mousemove", function (ev) {
        showTip([el("b", { text: name }), el("div", { class: "tr" }, [
          el("span", { text: "reads" }), el("span", { text: num(v) })
        ])], ev);
      });
      row.addEventListener("mouseleave", hideTip);
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

  function render() {
    var root = document.getElementById("root");
    root.textContent = "";
    var d = (window.openai && window.openai.toolOutput) || window.__DATA__ || {};

    if (!d.byAgent) {
      root.appendChild(el("div", { class: "empty", text: "No traffic data." }));
      return;
    }

    var total = Number(d.total || 0);
    var agents = Number(d.agentReads || 0);

    root.appendChild(el("div", { class: "head" }, [
      el("h1", { text: "decoindex traffic" }),
      el("span", { class: "win", text: "last " + (d.days || 7) + "d" })
    ]));

    var hero = el("div", { class: "hero" }, [
      el("div", { class: "label", text: "Agent reads" }),
      el("div", { class: "n", text: num(agents) }),
      el("div", {
        class: "sub",
        text: agents + total === 0
          ? "No reads in this window."
          : pct(agents, total) + "% of " + num(total) + " reads. " +
            "Browser pageviews are vanity — this is the number that moves the business."
      })
    ]);
    root.appendChild(hero);

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
      ])
    ]));

    series(root, d.byDay);

    var cols = el("div", { class: "cols" });
    cols.appendChild(ranking("By agent", d.byAgent, "ua_class", {
      color: colorFor, limit: 9
    }));
    cols.appendChild(ranking("By surface", d.bySurface, "surface", {
      color: function () { return "#4a3aa7"; }
    }));
    root.appendChild(cols);

    root.appendChild(ranking("Top storefronts", d.byDomain, "domain", {
      color: function () { return "#2a78d6"; }, limit: 10
    }));

    // Identity is never colour-alone: the legend is always present, and the
    // table view underneath covers the two ramp steps that sit under 3:1.
    var legend = el("div", { class: "legend" });
    ORDER.forEach(function (k) {
      var present = (d.byAgent || []).some(function (r) { return r.ua_class === k; });
      if (!present) return;
      legend.appendChild(el("div", { class: "lg" }, [
        el("span", { class: "sw", style: "background:" + colorFor(k) }),
        el("span", { text: k + (isAgent(k) ? "" : " (not an agent)") })
      ]));
    });
    root.appendChild(legend);

    root.appendChild(table("Table view — by agent", d.byAgent, "ua_class"));

    root.appendChild(el("div", {
      class: "note",
      text: "Reads of decoindex documents since " + String(d.since || "").slice(0, 10) +
            ". A read is one document served, from the edge, from KV, or resolved live."
    }));
  }

  render();
  window.addEventListener("openai:set_globals", render);
})();
</script>
</body>
</html>`;
