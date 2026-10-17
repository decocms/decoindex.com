import { env } from "cloudflare:workers";
import type { Share } from "../types";

/** A frozen turn from KV. Loaded only through dynamic import inside server-fn handlers. */
export async function readShare(id: string): Promise<Share | null> {
  if (!/^[0-9a-zA-Z]{8}$/.test(id)) return null;
  const raw = await (env as { SHARES?: { get(key: string): Promise<string | null> } }).SHARES?.get(`s:${id}`);
  return raw ? (JSON.parse(raw) as Share) : null;
}
