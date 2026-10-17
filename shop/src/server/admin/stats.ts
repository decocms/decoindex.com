import type { Env } from "../env";

/**
 * Read side of the shop's analytics. Everything comes from decoindex's
 * append-only `events` table (name = shop.*); writes live in events.ts.
 *
 * The question these answer is the one CHAT_MODELS exists for: which model
 * turns a question into a click. A chat "converts" when any of its tiles is
 * clicked through to a merchant (shop.click with that chat id).
 */

const since = (days: number) => new Date(Date.now() - Math.min(Math.max(days, 1), 90) * 86_400_000).toISOString();

async function all<T>(env: Env, sql: string, ...args: unknown[]): Promise<T[]> {
  if (!env.DB) return [];
  return (await env.DB.prepare(sql).bind(...args).all<T>()).results ?? [];
}

export interface ModelRow {
  model: string;
  turns: number;
  chats: number;
  avgMs: number;
  avgHits: number;
  errors: number;
  /** USD, as OpenRouter billed it. */
  cost: number;
  /** Turns that carry a cost (logged since Oct 17 2026; cache replays log 0): the denominator for cost per search. */
  costed: number;
  tokensIn: number;
  tokensOut: number;
  chatsClicked: number;
  clicks: number;
  up: number;
  down: number;
}

export interface QueryRow {
  ts: string;
  q: string | null;
  dept: string | null;
  model: string | null;
  ms: number | null;
  hits: number | null;
  curated: number | null;
  error: string | null;
  share: string | null;
  store: string | null;
  clicks: number;
}

export async function overview(env: Env, days: number) {
  const from = since(days);
  const [models, clicks, feedback, daily, brands, totals, spend] = await Promise.all([
    all<{ model: string; turns: number; chats: number; avgMs: number; avgHits: number; errors: number; cost: number; costed: number; tokensIn: number; tokensOut: number }>(
      env,
      `SELECT json_extract(meta,'$.model') AS model, COUNT(*) AS turns,
              COUNT(DISTINCT json_extract(meta,'$.chat')) AS chats,
              ROUND(AVG(ms)) AS avgMs, ROUND(AVG(json_extract(meta,'$.hits')),1) AS avgHits,
              SUM(CASE WHEN COALESCE(json_extract(meta,'$.error'),'') != '' THEN 1 ELSE 0 END) AS errors,
              COALESCE(SUM(json_extract(meta,'$.cost')),0) AS cost,
              COUNT(json_extract(meta,'$.cost')) AS costed,
              COALESCE(SUM(json_extract(meta,'$.tokensIn')),0) AS tokensIn,
              COALESCE(SUM(json_extract(meta,'$.tokensOut')),0) AS tokensOut
         FROM events WHERE name = 'shop.chat' AND ts > ? GROUP BY 1 ORDER BY turns DESC`,
      from,
    ),
    all<{ model: string; clicks: number; chatsClicked: number }>(
      env,
      `SELECT json_extract(meta,'$.model') AS model, COUNT(*) AS clicks,
              COUNT(DISTINCT json_extract(meta,'$.chat')) AS chatsClicked
         FROM events WHERE name = 'shop.click' AND ts > ? GROUP BY 1`,
      from,
    ),
    all<{ model: string; up: number; down: number }>(
      env,
      `SELECT json_extract(meta,'$.model') AS model,
              SUM(CASE WHEN json_extract(meta,'$.up') THEN 1 ELSE 0 END) AS up,
              SUM(CASE WHEN json_extract(meta,'$.up') THEN 0 ELSE 1 END) AS down
         FROM events WHERE name = 'shop.feedback' AND ts > ? GROUP BY 1`,
      from,
    ),
    all<{ day: string; turns: number; clicks: number; cost: number }>(
      env,
      `SELECT substr(ts,1,10) AS day,
              SUM(CASE WHEN name = 'shop.chat' THEN 1 ELSE 0 END) AS turns,
              COALESCE(SUM(CASE WHEN name = 'shop.chat' THEN json_extract(meta,'$.cost') END),0) AS cost,
              SUM(CASE WHEN name = 'shop.click' THEN 1 ELSE 0 END) AS clicks
         FROM events WHERE name IN ('shop.chat','shop.click') AND ts > ? GROUP BY 1 ORDER BY 1`,
      from,
    ),
    all<{ domain: string; clicks: number }>(
      env,
      `SELECT domain, COUNT(*) AS clicks FROM events
        WHERE name = 'shop.click' AND ts > ? AND domain IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      from,
    ),
    all<{ name: string; n: number }>(
      env,
      `SELECT name, COUNT(*) AS n FROM events
        WHERE name IN ('shop.chat','shop.similar','shop.click','shop.open','shop.share','shop.feedback') AND ts > ? GROUP BY 1`,
      from,
    ),
    // Fixed windows, whatever period is selected: what the shop costs today, this week, this month.
    all<{ d1: number; d7: number; d30: number }>(
      env,
      `SELECT COALESCE(SUM(CASE WHEN ts > ? THEN json_extract(meta,'$.cost') END),0) AS d1,
              COALESCE(SUM(CASE WHEN ts > ? THEN json_extract(meta,'$.cost') END),0) AS d7,
              COALESCE(SUM(json_extract(meta,'$.cost')),0) AS d30
         FROM events WHERE name = 'shop.chat' AND ts > ?`,
      since(1),
      since(7),
      since(30),
    ),
  ]);

  const byModel = new Map<string, ModelRow>();
  for (const m of models) byModel.set(m.model, { ...m, chatsClicked: 0, clicks: 0, up: 0, down: 0 });
  // Clicks from shared links and shelves carry no chat model; keep them out of the comparison.
  for (const c of clicks) {
    const row = byModel.get(c.model);
    if (row) Object.assign(row, { clicks: c.clicks, chatsClicked: c.chatsClicked });
  }
  for (const f of feedback) {
    const row = byModel.get(f.model);
    if (row) Object.assign(row, { up: f.up, down: f.down });
  }
  const count = (n: string) => totals.find((t) => t.name === n)?.n ?? 0;

  return {
    days,
    totals: {
      turns: count("shop.chat"),
      similar: count("shop.similar"),
      clicks: count("shop.click"),
      opens: count("shop.open"),
      shares: count("shop.share"),
      feedback: count("shop.feedback"),
    },
    models: [...byModel.values()],
    spend: spend[0] ?? { d1: 0, d7: 0, d30: 0 },
    daily,
    brands,
  };
}

export async function queries(env: Env, days: number, limit = 50, search?: string): Promise<QueryRow[]> {
  const like = search ? `%${search.toLowerCase()}%` : null;
  return all<QueryRow>(
    env,
    `SELECT e.ts, json_extract(e.meta,'$.q') AS q, json_extract(e.meta,'$.dept') AS dept,
            json_extract(e.meta,'$.model') AS model, e.ms, json_extract(e.meta,'$.hits') AS hits,
            json_extract(e.meta,'$.curated') AS curated, NULLIF(json_extract(e.meta,'$.error'),'') AS error,
            NULLIF(json_extract(e.meta,'$.share'),'') AS share, json_extract(e.meta,'$.store') AS store,
            (SELECT COUNT(*) FROM events c WHERE c.name = 'shop.click'
               AND json_extract(c.meta,'$.chat') = json_extract(e.meta,'$.chat')) AS clicks
       FROM events e
      WHERE e.name = 'shop.chat' AND e.ts > ? AND json_extract(e.meta,'$.q') IS NOT NULL
        AND (? IS NULL OR lower(json_extract(e.meta,'$.q')) LIKE ?)
      ORDER BY e.ts DESC LIMIT ?`,
    since(days),
    like,
    like,
    Math.min(Math.max(limit, 1), 200),
  );
}

export async function topQueries(env: Env, days: number, limit = 20) {
  return all<{ q: string; n: number; avgMs: number }>(
    env,
    `SELECT lower(trim(json_extract(meta,'$.q'))) AS q, COUNT(*) AS n, ROUND(AVG(ms)) AS avgMs
       FROM events WHERE name = 'shop.chat' AND ts > ? AND json_extract(meta,'$.q') IS NOT NULL
      GROUP BY 1 ORDER BY n DESC, q LIMIT ?`,
    since(days),
    Math.min(Math.max(limit, 1), 100),
  );
}

/** Page views (shop.view): people vs link previews vs bots, where people come from, which bots. */
export async function traffic(env: Env, days: number) {
  const from = since(days);
  const [byKind, refs, countries, bots] = await Promise.all([
    all<{ cls: string; kind: string; n: number }>(
      env,
      `SELECT json_extract(meta,'$.cls') AS cls, json_extract(meta,'$.kind') AS kind, COUNT(*) AS n
         FROM events WHERE name = 'shop.view' AND ts > ? GROUP BY 1, 2`,
      from,
    ),
    all<{ ref: string | null; n: number }>(
      env,
      `SELECT COALESCE(json_extract(meta,'$.ref'), 'direto / app') AS ref, COUNT(*) AS n
         FROM events WHERE name = 'shop.view' AND ts > ? AND json_extract(meta,'$.cls') = 'browser'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      from,
    ),
    all<{ country: string | null; n: number }>(
      env,
      `SELECT country, COUNT(*) AS n FROM events
        WHERE name = 'shop.view' AND ts > ? AND json_extract(meta,'$.cls') = 'browser'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      from,
    ),
    all<{ ua: string | null; cls: string; n: number }>(
      env,
      `SELECT json_extract(meta,'$.ua') AS ua, json_extract(meta,'$.cls') AS cls, COUNT(*) AS n FROM events
        WHERE name = 'shop.view' AND ts > ? AND json_extract(meta,'$.cls') != 'browser'
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`,
      from,
    ),
  ]);
  const sum = (f: (r: { cls: string; kind: string }) => boolean) => byKind.filter(f).reduce((s, r) => s + r.n, 0);
  return {
    people: sum((r) => r.cls === "browser"),
    previews: sum((r) => r.cls === "preview"),
    bots: sum((r) => r.cls === "bot"),
    kinds: Object.fromEntries(["home", "chat", "share", "other"].map((k) => [k, sum((r) => r.cls === "browser" && r.kind === k)])),
    refs,
    countries,
    botAgents: bots,
  };
}
