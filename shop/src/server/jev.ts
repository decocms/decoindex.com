import { BRAND_CONTEXT } from "./brand-context";
import { BRANDS, type Brand } from "./brands";
import type { Env } from "./env";

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
async function score(
  env: Env,
  state: Record<string, string>,
  questions: string[],
  criteria: string[],
  timeout: number,
): Promise<{ scores: number[]; cost: number } | null> {
  if (env.PRESELECT_MODEL === "off") return null; // kill switch, and the A/B baseline
  try {
    const res = await fetch(`https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openrouter/v1/systemone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.CF_AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        model: env.PRESELECT_MODEL || "~typesafe/jev-latest",
        state,
        questions: Object.fromEntries(questions.map((q, i) => [`q${i}`, { type: "score", instructions: q, criteria }])),
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`systemone ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()) as { answers?: Record<string, { score?: number }>; usage?: { cost?: number } };
    const scores = questions.map((_, i) => out.answers?.[`q${i}`]?.score ?? -1);
    if (scores.filter((x) => x >= 0).length < questions.length / 2) return null;
    return { scores, cost: out.usage?.cost ?? 0 };
  } catch (err) {
    console.error("jev failed", String((err as Error)?.message ?? err).slice(0, 200));
    return null;
  }
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

/** Before the chat model runs: the ten brands most likely to have it, so its prompt carries 10 lines, not 57. */
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
  const started = Date.now();
  const res = await score(
    env,
    stateOf(input),
    tiles.map((t) => `Quão bem este produto atende ao pedido do cliente? ${line(t)}`),
    ["Não tem nada a ver", "Parecido, mas não é isso", "É exatamente o que ele pediu"],
    4_000,
  );
  if (!res) return null;
  const count = new Map<string, number>();
  const ranked = tiles
    .map((t, i) => ({ t, s: res.scores[i] }))
    .sort((a, b) => b.s - a.s)
    .filter(({ t }) => {
      const n = count.get(t.brand) ?? 0;
      count.set(t.brand, n + 1);
      return n < perBrand;
    })
    .slice(0, keep)
    .map((r) => r.t);
  return { tiles: ranked, ms: Date.now() - started, cost: res.cost };
}
