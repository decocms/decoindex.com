import type { Env } from "./env";

/** Appends to decoindex's `events` table (surface = "shop"). Never throws: analytics must not break a request. */
export async function logEvent(
  env: Env,
  name: string,
  ms: number | null,
  meta: Record<string, unknown>,
  domain?: string,
  client: { uaClass?: string; country?: string } = {},
) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO events (ts, name, domain, surface, ua_class, country, ms, meta) VALUES (?, ?, ?, 'shop', ?, ?, ?, ?)`,
    )
      .bind(new Date().toISOString(), name, domain ?? null, client.uaClass ?? "browser", client.country ?? null, ms, JSON.stringify(meta))
      .run();
  } catch (err) {
    console.error("logEvent failed", name, err);
  }
}
