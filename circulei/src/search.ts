import type { Piece } from "./catalog";
import type { Env } from "./env";

const GATEWAY = (env: Env) => `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openrouter/v1`;
const auth = (env: Env): Record<string, string> =>
  env.CF_AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` } : {};

const line = (p: Piece) =>
  [p.title, p.brand, p.size && `tam ${p.size}`, p.bride && "noiva", p.text.slice(0, 280)].filter(Boolean).join(" | ");

/**
 * Jev (System One) scores every piece against the ask in one call: one `score`
 * question each, same pattern as the shop. The whole catalog fits in one call,
 * so there is no keyword prefilter to miss "algo leve pra praia". Scores are per
 * ask, not per city, so one cached result serves every city.
 */
export async function scoreAll(env: Env, ask: string, pieces: Piece[]): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`${GATEWAY(env)}/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(env) },
      body: JSON.stringify({
        model: env.PRESELECT_MODEL || "~typesafe/jev-latest",
        state: { loja: "Circulei — aluguel de roupas de festa e grife entre mulheres", pedido: ask.slice(0, 300) },
        questions: Object.fromEntries(
          pieces.map((p, i) => [
            `q${i}`,
            {
              type: "score",
              instructions: `Quão bem esta peça atende ao pedido da cliente? ${line(p)}`,
              criteria: ["Não tem nada a ver", "Parecida, mas não é isso", "É exatamente o que ela pediu"],
            },
          ]),
        ),
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`systemone ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()) as { answers?: Record<string, { score?: number }> };
    const scores = Object.fromEntries(pieces.map((p, i) => [p.handle, out.answers?.[`q${i}`]?.score ?? -1]));
    return Object.values(scores).filter((s) => s >= 0).length > pieces.length / 2 ? scores : null;
  } catch (err) {
    console.error("jev failed", String((err as Error)?.message ?? err).slice(0, 200));
    return null;
  }
}

/** Keyword fallback for when Jev is down: still a result, never an empty page. */
export function keywordScores(ask: string, pieces: Piece[]): Record<string, number> {
  const words = ask.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/\W+/).filter((w) => w.length > 2);
  return Object.fromEntries(
    pieces.map((p) => {
      const hay = `${p.title} ${p.brand} ${p.colors.join(" ")}`.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
      return [p.handle, words.filter((w) => hay.includes(w)).length / (words.length || 1)];
    }),
  );
}

/**
 * Two short sentences from a stylist who has just looked at the picks, plus which of them she cites,
 * in the order she cites them: the grid puts those first, so the pieces named in the text are the
 * ones on top. Null on any failure: the grid stands alone.
 */
export async function stylistNote(env: Env, ask: string, city: string, picks: Piece[]): Promise<{ text: string; cited: string[] } | null> {
  try {
    const top = picks.slice(0, 8);
    const list = top.map((p, i) => `${i + 1}. ${p.title} (${p.brand}, tam ${p.size || "?"}, ${p.city})`).join("\n");
    const res = await fetch(`${GATEWAY(env)}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-aig-metadata": JSON.stringify({ app: "circulei" }), ...auth(env) },
      body: JSON.stringify({
        model: env.NOTE_MODEL || "anthropic/claude-haiku-5.5",
        reasoning: { enabled: false },
        max_tokens: 300,
        temperature: 0.6,
        messages: [
          {
            role: "user",
            content: `Você é a curadora da Circulei, aluguel de roupas entre mulheres. Uma cliente em ${city} pediu: "${ask.slice(0, 300)}".\nEstas são as peças que separei:\n${list}\n\nEscreva no máximo 2 frases curtas (até 45 palavras no total), calorosas e específicas, em português do Brasil, comentando a escolha: cite 1 ou 2 peças pelo nome e por que funcionam pra ocasião. Sem saudação, sem emoji, sem preço, sem markdown.\nResponda só JSON: {"nota":"...","citadas":[números das peças citadas, na ordem em que aparecem na nota]}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`note ${res.status}`);
    const out = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = out.choices?.[0]?.message?.content?.trim() ?? "";
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "null") as { nota?: unknown; citadas?: unknown } | null;
    const text = typeof json?.nota === "string" ? json.nota.trim() : "";
    if (!text) return null;
    const cited = (Array.isArray(json?.citadas) ? json.citadas : [])
      .map((n) => top[Number(n) - 1]?.handle)
      .filter((h, i, a): h is string => !!h && a.indexOf(h) === i);
    return { text: text.slice(0, 500), cited };
  } catch (err) {
    console.error("note failed", String(err).slice(0, 200));
    return null;
  }
}

export async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
