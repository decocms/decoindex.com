import type { Env } from "../env";

/**
 * bge-m3 is multilingual, which is not optional here: the catalog is in
 * pt-BR and a meaningful share of agent queries will arrive in English.
 * A monolingual English model silently ranks Portuguese catalogs as noise.
 */
export async function embed(env: Env, texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  try {
    const res = (await env.AI.run(env.EMBEDDING_MODEL as keyof AiModels, {
      text: texts,
    } as never)) as { data?: number[][] };
    return res?.data ?? null;
  } catch {
    // Search degrades to lexical-only rather than failing the request.
    return null;
  }
}

export async function embedOne(env: Env, text: string): Promise<number[] | null> {
  const out = await embed(env, [text]);
  return out?.[0] ?? null;
}
