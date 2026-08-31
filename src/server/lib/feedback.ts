import type { Env } from "../env";
import { classifyClient } from "./registry";
import { normalizeDomain } from "./url";

/**
 * Agent feedback. The read path cannot tell the difference between "this
 * category is genuinely empty" and "we parsed the response wrong" — only the
 * caller can, and only at the moment it happens. So submission is public,
 * unauthenticated and documented on every page: an agent that just hit a bad
 * document will not stop to go get an API key.
 *
 * Reading and triaging is private, over MCP.
 */

export const KINDS = ["wrong_data", "missing", "broken", "unsupported", "other"] as const;
export type FeedbackKind = (typeof KINDS)[number];

export const STATUSES = ["new", "triaged", "fixed", "wontfix"] as const;
export type FeedbackStatus = (typeof STATUSES)[number];

export interface FeedbackRow {
  id: string;
  ts: string;
  domain: string | null;
  path: string | null;
  kind: FeedbackKind;
  message: string;
  expected: string | null;
  ua_class: string | null;
  country: string | null;
  status: FeedbackStatus;
  note: string | null;
  updated_at: string | null;
}

const MAX_MESSAGE = 2_000;
const MAX_EXPECTED = 1_000;

export interface SubmitInput {
  url?: unknown;
  domain?: unknown;
  path?: unknown;
  kind?: unknown;
  message?: unknown;
  expected?: unknown;
}

export class BadReport extends Error {}

/**
 * Accepts either an explicit {domain, path} or the decoindex URL the agent was
 * reading, because the one thing a caller reliably has is the URL that failed.
 */
export async function submitFeedback(
  env: Env,
  input: SubmitInput,
  ctx: { ua?: string; country?: string },
): Promise<{ id: string; status: string; message: string }> {
  const message = str(input.message, MAX_MESSAGE);
  if (!message) throw new BadReport("`message` is required: describe what went wrong.");

  const kind = KINDS.includes(input.kind as FeedbackKind) ? (input.kind as FeedbackKind) : "other";

  let domain = typeof input.domain === "string" ? normalizeDomain(input.domain) : null;
  let path = str(input.path, 500);

  // Pull both out of a decoindex URL if that is all we were given.
  if (typeof input.url === "string" && (!domain || !path)) {
    try {
      const segments = new URL(input.url).pathname.replace(/^\/+/, "").split("/");
      domain ??= normalizeDomain(segments[0] ?? "");
      path ??= "/" + segments.slice(1).join("/");
    } catch {
      // A malformed URL is not worth rejecting the report over.
    }
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO feedback (id, ts, domain, path, kind, message, expected, ua_class, country, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
  )
    .bind(
      id,
      new Date().toISOString(),
      domain,
      path,
      kind,
      message,
      str(input.expected, MAX_EXPECTED),
      classifyClient(ctx.ua),
      ctx.country ?? null,
    )
    .run();

  return { id, status: "received", message: "Thank you — this is read by a human." };
}

export interface ListFilters {
  status?: string;
  domain?: string;
  kind?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export async function listFeedback(env: Env, f: ListFilters = {}): Promise<{
  total: number;
  items: FeedbackRow[];
}> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.status) { where.push("status = ?"); args.push(f.status); }
  if (f.domain) { where.push("domain = ?"); args.push(normalizeDomain(f.domain) ?? f.domain); }
  if (f.kind) { where.push("kind = ?"); args.push(f.kind); }
  if (f.since) { where.push("ts >= ?"); args.push(f.since); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const limit = Math.min(Math.max(Number(f.limit) || 25, 1), 200);
  const offset = Math.max(Number(f.offset) || 0, 0);

  const counted = await env.DB.prepare(`SELECT COUNT(*) AS n FROM feedback ${clause}`)
    .bind(...args)
    .first<{ n: number }>();
  const rows = await env.DB.prepare(
    `SELECT * FROM feedback ${clause} ORDER BY ts DESC LIMIT ? OFFSET ?`,
  )
    .bind(...args, limit, offset)
    .all<FeedbackRow>();

  return { total: counted?.n ?? 0, items: rows.results ?? [] };
}

export async function getFeedback(env: Env, id: string): Promise<FeedbackRow | null> {
  return env.DB.prepare("SELECT * FROM feedback WHERE id = ?").bind(id).first<FeedbackRow>();
}

export async function updateFeedback(
  env: Env,
  id: string,
  patch: { status?: string; note?: string },
): Promise<FeedbackRow | null> {
  if (patch.status && !STATUSES.includes(patch.status as FeedbackStatus)) {
    throw new BadReport(`status must be one of: ${STATUSES.join(", ")}`);
  }
  await env.DB.prepare(
    `UPDATE feedback
        SET status = COALESCE(?, status), note = COALESCE(?, note), updated_at = ?
      WHERE id = ?`,
  )
    .bind(patch.status ?? null, str(patch.note, 2_000), new Date().toISOString(), id)
    .run();
  return getFeedback(env, id);
}

/** What is actually broken, most-reported first. The triage queue in one call. */
export async function feedbackStats(env: Env, since?: string): Promise<unknown> {
  const bound = since ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const q = async (sql: string) =>
    (await env.DB.prepare(sql).bind(bound).all()).results ?? [];
  const [byStatus, byKind, byDomain, byAgent] = await Promise.all([
    q("SELECT status, COUNT(*) n FROM feedback WHERE ts >= ? GROUP BY 1 ORDER BY n DESC"),
    q("SELECT kind, COUNT(*) n FROM feedback WHERE ts >= ? GROUP BY 1 ORDER BY n DESC"),
    q("SELECT domain, COUNT(*) n FROM feedback WHERE ts >= ? AND domain IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 20"),
    q("SELECT ua_class, COUNT(*) n FROM feedback WHERE ts >= ? GROUP BY 1 ORDER BY n DESC"),
  ]);
  return { since: bound, byStatus, byKind, byDomain, byAgent };
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}
