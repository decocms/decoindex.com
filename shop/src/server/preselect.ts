import { BRAND_CONTEXT } from "./brand-context";
import { BRANDS, type Brand } from "./brands";
import type { Env } from "./env";

/** One line per brand: what the model reads to decide where to look. */
export function rosterLine(b: Brand): string {
  const c = BRAND_CONTEXT[b.domain];
  const facts = c ? [c.from, c.since && `desde ${c.since}`, c.price].filter(Boolean).join(" · ") : "";
  return `- ${b.domain} — ${b.name} [${b.segments.join(", ")}]${facts ? ` (${facts})` : ""}: ${b.blurb}.${c ? ` ${c.about}` : ""}`;
}

const TIMEOUT = 3_000;
const KEEP = 10;

/**
 * Cheap first pass with Jev, TypeSafe's decision model: it answers typed questions with
 * probabilities instead of writing text. One `score` question per brand ("how likely is this
 * brand to have what the shopper asked?"), all answered in parallel in one call over the same
 * state, ~0.8s and ~US$0.0003. The ten best go to the chat model, which then carries only those
 * brands' lines instead of all 57.
 *
 * Called through the AI Gateway's OpenRouter route at /v1/systemone (the gateway does not proxy
 * OpenRouter's /api/alpha/decisions, which is the same API). Returns null on any failure, and the
 * caller then sends the full roster: preselection can only narrow, never lose a search.
 */
export async function preselect(
  env: Env,
  input: { asks: string[]; dept?: string; store?: string },
): Promise<{ domains: string[]; ms: number; cost: number } | null> {
  const started = Date.now();
  try {
    const res = await fetch(`https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openrouter/v1/systemone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.CF_AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        model: env.PRESELECT_MODEL || "~typesafe/jev-latest",
        state: {
          departamento: input.dept ?? "qualquer",
          // Earlier asks give a follow-up ("e da Reserva?", "mais barato") its subject.
          pedido: input.asks.map((a) => a.slice(0, 400)).join(" → "),
        },
        questions: Object.fromEntries(
          BRANDS.map((b, i) => [
            `b${i}`,
            {
              type: "score",
              instructions: `Quão provável é esta marca ter o que o cliente pede (tipo de peça, departamento, estilo, e origem ou faixa de preço se ele pediu)? ${rosterLine(b).slice(2)}`,
              criteria: ["Não vende isso", "Talvez tenha algo", "Vende exatamente isso"],
            },
          ]),
        ),
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`systemone ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()) as { answers?: Record<string, { score?: number }>; usage?: { cost?: number } };
    const ranked = BRANDS.map((b, i) => ({ domain: b.domain, score: out.answers?.[`b${i}`]?.score ?? -1 }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score);
    if (ranked.length < BRANDS.length / 2) return null;
    const domains = ranked.slice(0, KEEP).map((r) => r.domain);
    if (input.store && !domains.includes(input.store)) domains.unshift(input.store);
    return { domains, ms: Date.now() - started, cost: out.usage?.cost ?? 0 };
  } catch (err) {
    console.error("preselect failed", String((err as Error)?.message ?? err).slice(0, 200));
    return null;
  }
}
