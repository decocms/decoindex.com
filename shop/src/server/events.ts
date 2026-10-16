import type { Env } from "./env";

/** Appends to decoindex's `events` table (surface = "shop"). Never throws: analytics must not break a request. */
export async function logEvent(env: Env, name: string, ms: number | null, meta: Record<string, unknown>, domain?: string) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO events (ts, name, domain, surface, ua_class, ms, meta) VALUES (?, ?, ?, 'shop', 'browser', ?, ?)`,
    )
      .bind(new Date().toISOString(), name, domain ?? null, ms, JSON.stringify(meta))
      .run();
  } catch (err) {
    console.error("logEvent failed", name, err);
  }
}
