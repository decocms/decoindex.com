import { BRAND_CONTEXT } from "./brand-context";
import { BRANDS, type Brand } from "./brands";
import type { Env } from "./env";
import { browsable, type Category } from "./taxonomy";

/** One line per brand: what the model reads to decide where to look. */
export function rosterLine(b: Brand): string {
  const c = BRAND_CONTEXT[b.domain];
  const facts = c ? [c.from, c.since && `desde ${c.since}`, c.price].filter(Boolean).join(" · ") : "";
  return `- ${b.domain} — ${b.name} [${b.segments.join(", ")}]${facts ? ` (${facts})` : ""}: ${b.blurb}.${c ? ` ${c.about}` : ""}`;
}

/**
 * Jev, TypeSafe's decision model: it answers typed questions with probabilities instead of
 * writing text, and bills input tokens only. Every helper here asks one `score` question per
 * item ("how likely is this to be what the shopper asked for?"), all answered in parallel in one
 * call over the same state: ~1s and fractions of a cent for 50-90 items.
 *
 * Called through the AI Gateway's OpenRouter route at /v1/systemone (the gateway does not proxy
 * OpenRouter's /api/alpha/decisions, which is the same API). Every helper returns null on any
 * failure, and its caller falls back to the unfiltered list: Jev can only narrow, never lose.
 */
/** One raw Decisions call: typed questions in, typed answers out. Null on any failure. */
export async function decide<A = Record<string, unknown>>(
  env: Env,
  state: Record<string, string>,
  questions: Record<string, object>,
  timeout: number,
): Promise<{ answers: Record<string, A>; cost: number } | null> {
  if (env.PRESELECT_MODEL === "off") return null; // kill switch, and the A/B baseline
  try {
    const res = await fetch(`https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openrouter/v1/systemone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.CF_AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` } : {}),
      },
      body: JSON.stringify({ model: env.PRESELECT_MODEL || "~typesafe/jev-latest", state, questions }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`systemone ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()) as { answers?: Record<string, A>; usage?: { cost?: number } };
    return out.answers ? { answers: out.answers, cost: out.usage?.cost ?? 0 } : null;
  } catch (err) {
    console.error("jev failed", String((err as Error)?.message ?? err).slice(0, 200));
    return null;
  }
}

async function score(
  env: Env,
  state: Record<string, string>,
  questions: string[],
  criteria: string[],
  timeout: number,
): Promise<{ scores: number[]; cost: number } | null> {
  const res = await decide<{ score?: number }>(
    env,
    state,
    Object.fromEntries(questions.map((q, i) => [`q${i}`, { type: "score", instructions: q, criteria }])),
    timeout,
  );
  if (!res) return null;
  const scores = questions.map((_, i) => res.answers[`q${i}`]?.score ?? -1);
  if (scores.filter((x) => x >= 0).length < questions.length / 2) return null;
  return { scores, cost: res.cost };
}

interface Ask {
  asks: string[];
  dept?: string;
  profile?: string;
}
// Earlier asks give a follow-up ("e da Reserva?", "mais barato") its subject.
const stateOf = (a: Ask) => ({
  departamento: a.dept ?? "qualquer",
  pedido: a.asks.map((x) => x.slice(0, 400)).join(" → "),
  ...(a.profile ? { sobre_o_cliente: a.profile } : {}),
});

/** Before the chat model runs: the ten brands most likely to have it, so its prompt carries 10 lines, not the whole roster. */
export async function preselect(env: Env, input: Ask & { store?: string }): Promise<{ domains: string[]; ms: number; cost: number } | null> {
  const started = Date.now();
  const res = await score(
    env,
    stateOf(input),
    BRANDS.map((b) => `Quão provável é esta marca ter o que o cliente pede (tipo de peça, departamento, estilo, e origem ou faixa de preço se ele pediu)? ${rosterLine(b).slice(2)}`),
    ["Não vende isso", "Talvez tenha algo", "Vende exatamente isso"],
    3_000,
  );
  if (!res) return null;
  const domains = BRANDS.map((b, i) => ({ domain: b.domain, s: res.scores[i] }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 10)
    .map((r) => r.domain);
  if (input.store && !domains.includes(input.store)) domains.unshift(input.store);
  return { domains, ms: Date.now() - started, cost: res.cost };
}

/** How well each tile answers the conversation, 0 (nothing to do with it) to 2 (exactly it), in input order. */
export async function scoreTiles<T>(
  env: Env,
  input: Ask,
  tiles: T[],
  line: (t: T) => string,
): Promise<{ scores: number[]; ms: number; cost: number } | null> {
  if (!tiles.length) return null;
  const started = Date.now();
  const res = await score(
    env,
    stateOf(input),
    tiles.map((t) => `Quão bem este produto atende ao pedido do cliente? ${line(t)}`),
    ["Não tem nada a ver", "Parecido, mas não é isso", "É exatamente o que ele pediu"],
    4_000,
  );
  return res ? { scores: res.scores, ms: Date.now() - started, cost: res.cost } : null;
}

/** Best first, at most `perBrand` per brand so the pick stays mixed. */
export function topByScore<T extends { brand: string }>(tiles: T[], scores: number[], keep: number, perBrand: number): T[] {
  const count = new Map<string, number>();
  return tiles
    .map((t, i) => ({ t, s: scores[i] ?? -1, i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .filter(({ t }) => {
      const n = count.get(t.brand) ?? 0;
      count.set(t.brand, n + 1);
      return n < perBrand;
    })
    .slice(0, keep)
    .map((r) => r.t);
}

/**
 * Between steps: a find_products round returns up to 90 tiles and every one becomes a line the
 * chat model reads, then re-reads on each later step. Jev scores each tile against the
 * conversation and only the best `keep` go back to the model (at most `perBrand` per brand, so
 * the pick stays mixed). The shopper's screen still gets every tile.
 */
export async function rankTiles<T extends { brand: string }>(
  env: Env,
  input: Ask,
  tiles: T[],
  line: (t: T) => string,
  keep = 30,
  perBrand = 8,
): Promise<{ tiles: T[]; ms: number; cost: number } | null> {
  if (tiles.length <= keep) return null;
  const res = await scoreTiles(env, input, tiles, line);
  return res ? { tiles: topByScore(tiles, res.scores, keep, perBrand), ms: res.ms, cost: res.cost } : null;
}

const CATEGORY_TTL = 7 * 86_400;

/**
 * When no category name carries the type's words (Dress To files everything under
 * "/lovedress/shop", Sacada under "/off"), Jev scores the store's categories for it. Remembered
 * per store, type and department for a week, including "none", so each store pays once
 * (~US$0.0003). A Jev failure is not remembered: the next shopper tries again.
 */
export async function categoryByJev(
  env: Env,
  domain: string,
  cats: Category[],
  type: string,
  dept?: "feminino" | "masculino",
): Promise<Category | undefined> {
  const key = `jevcat:v1:${domain}:${type}:${dept ?? ""}`;
  const hit = await env.SHARES?.get(key).catch(() => null);
  if (hit != null) return hit ? cats.find((c) => c.path === hit) : undefined;
  const options = cats.filter((c) => browsable(c, dept)).slice(0, 120);
  if (!options.length) return undefined;
  const res = await score(
    env,
    { tipo_de_peca: type, departamento: dept ?? "qualquer" },
    options.map((c) => `Esta categoria da loja lista principalmente peças do tipo "${type}"${dept ? ` do departamento ${dept}` : ""}? ${c.name} (${c.path})`),
    ["Não", "Mistura isso com outras coisas", "Sim, é exatamente essa"],
    3_000,
  );
  if (!res) return undefined;
  const best = options.map((c, i) => ({ c, s: res.scores[i] })).sort((a, b) => b.s - a.s)[0];
  const pick = best && best.s >= 1.4 ? best.c : undefined;
  await env.SHARES?.put(key, pick?.path ?? "", { expirationTtl: CATEGORY_TTL }).catch(() => {});
  return pick;
}
