import type { Env } from "../env";
import { UA } from "../platform/detect";
import { resolve } from "../platform";
import { vtexApiOrigin } from "../platform/vtex";
import { getDomain } from "../lib/registry";
import { normalizeDomain } from "../lib/url";
import type { Storefront } from "../lib/types";
import {
  KINDS,
  STATUSES,
  feedbackStats,
  getFeedback,
  listFeedback,
  updateFeedback,
} from "../lib/feedback";

/**
 * The private control plane, as MCP tools. These answer the two questions that
 * decide what to fix next: what did agents say is broken, and what are agents
 * actually reading.
 */

export interface ToolDefinition {
  name: string;
  /** Human-readable label. Apps SDK hosts show this instead of the name. */
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Shape of the return value, when it is worth the model knowing in advance. */
  outputSchema?: Record<string, unknown>;
  /** `readOnlyHint` / `openWorldHint` / `destructiveHint` — safety metadata. */
  annotations?: Record<string, unknown>;
  /**
   * Host-specific metadata, hidden from the model. Carries
   * `openai/outputTemplate` — the `ui://` URI of this tool's widget, which must
   * match a resource from `resources/list` exactly or no UI is paired.
   */
  meta?: Record<string, unknown>;
  /**
   * `ctx` carries waitUntil: a read tool writes to KV and logs its event after
   * the response, exactly like the HTTP path.
   */
  execute: (
    env: Env,
    input: Record<string, unknown>,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ) => Promise<unknown>;
}

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const str = (input: Record<string, unknown>, key: string): string | undefined => {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

const num = (input: Record<string, unknown>, key: string): number | undefined => {
  const v = input[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

function required(input: Record<string, unknown>, key: string): string {
  const v = str(input, key);
  if (!v) throw rpcError(-32602, `Missing required parameter: ${key}`);
  return v;
}

export function rpcError(code: number, message: string): Error & { code: number } {
  const e = new Error(message) as Error & { code: number };
  e.code = code;
  return e;
}

export const tools: ToolDefinition[] = [
  {
    name: "feedback_list",
    description:
      "List reports agents filed about bad or missing documents, newest first. Start here: `status: \"new\"` is the untriaged queue. Every row carries the exact domain and path that failed, so a report is directly reproducible.",
    inputSchema: object({
      status: { type: "string", enum: [...STATUSES], description: "Defaults to all." },
      domain: { type: "string", description: "Merchant domain, e.g. farmrio.com.br" },
      kind: { type: "string", enum: [...KINDS] },
      since: { type: "string", description: "ISO timestamp; only reports at or after it." },
      limit: { type: "integer", minimum: 1, maximum: 200, default: 25 },
      offset: { type: "integer", minimum: 0, default: 0 },
    }),
    execute: (env, input) =>
      listFeedback(env, {
        status: str(input, "status"),
        domain: str(input, "domain"),
        kind: str(input, "kind"),
        since: str(input, "since"),
        limit: num(input, "limit"),
        offset: num(input, "offset"),
      }),
  },
  {
    name: "feedback_get",
    description: "Fetch one report by id, with its full message, expected value and triage note.",
    inputSchema: object({ id: { type: "string" } }, ["id"]),
    execute: async (env, input) => {
      const row = await getFeedback(env, required(input, "id"));
      if (!row) throw rpcError(-32602, `No feedback with id ${required(input, "id")}`);
      return row;
    },
  },
  {
    name: "feedback_update",
    description:
      "Triage a report: set its status and leave a note explaining the call. Use 'fixed' only once the fix is deployed and the reported URL actually returns the right document.",
    inputSchema: object(
      {
        id: { type: "string" },
        status: { type: "string", enum: [...STATUSES] },
        note: { type: "string", maxLength: 2000 },
      },
      ["id"],
    ),
    execute: async (env, input) => {
      const row = await updateFeedback(env, required(input, "id"), {
        status: str(input, "status"),
        note: str(input, "note"),
      });
      if (!row) throw rpcError(-32602, "No feedback with that id");
      return row;
    },
  },
  {
    name: "feedback_stats",
    description:
      "Counts of reports by status, kind, domain and reporting agent. The fastest way to see which merchant or which parser is generating the complaints.",
    inputSchema: object({
      since: { type: "string", description: "ISO timestamp. Defaults to 30 days ago." },
    }),
    execute: (env, input) => feedbackStats(env, str(input, "since")),
  },
  {
    name: "traffic_stats",
    title: "Traffic",
    description:
      "Reads of the service grouped by agent class, surface, storefront and day. ua_class is the number that matters — reads from openai, anthropic, perplexity and script are the business; browser pageviews are vanity. Returns agentReads and total so the split does not have to be recomputed.",
    inputSchema: object({
      days: { type: "integer", minimum: 1, maximum: 90, default: 7 },
    }),
    annotations: { readOnlyHint: true },
    meta: {
      "openai/outputTemplate": "ui://widget/decoindex-traffic.html",
      "openai/toolInvocation/invoking": "Reading traffic",
      "openai/toolInvocation/invoked": "Traffic loaded",
    },
    execute: async (env, input) => {
      const days = num(input, "days") ?? 7;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const q = async (sql: string) => (await env.DB.prepare(sql).bind(since).all()).results ?? [];
      const [byAgent, bySurface, byDomain, byCache, byDay] = await Promise.all([
        q("SELECT ua_class, COUNT(*) n FROM events WHERE ts >= ? AND name='read' GROUP BY 1 ORDER BY n DESC"),
        q("SELECT surface, COUNT(*) n FROM events WHERE ts >= ? AND name='read' GROUP BY 1 ORDER BY n DESC"),
        q("SELECT domain, COUNT(*) n FROM events WHERE ts >= ? AND name='read' AND domain IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 20"),
        q("SELECT json_extract(meta,'$.cache') cache, COUNT(*) n FROM events WHERE ts >= ? AND name='read' GROUP BY 1 ORDER BY n DESC"),
        // Day *and* class in one pass: a total per day cannot answer "is agent
        // traffic growing", which is the only question this panel exists for.
        // substr over date() because ts is stored as a full ISO string.
        q(`SELECT substr(ts,1,10) day, ua_class, COUNT(*) n
             FROM events WHERE ts >= ? AND name='read'
            GROUP BY 1,2 ORDER BY 1 ASC`),
      ]);

      // The headline. CLAUDE.md is explicit that browser pageviews are vanity
      // and reads from the model vendors plus scripted clients are the business,
      // so the split is computed here rather than left for a reader to eyeball
      // off a list — a dashboard that makes you do the arithmetic gets ignored.
      const AGENTS = new Set(["openai", "anthropic", "perplexity", "google-ai", "other-crawler", "script"]);
      const total = byAgent.reduce((s, r) => s + Number((r as { n: number }).n), 0);
      const agents = byAgent
        .filter((r) => AGENTS.has(String((r as { ua_class: string }).ua_class)))
        .reduce((s, r) => s + Number((r as { n: number }).n), 0);

      return { since, days, total, agentReads: agents, byAgent, bySurface, byDomain, byCache, byDay };
    },
  },
  {
    name: "domain_list",
    description:
      "Storefronts the service has resolved at least once: platform, origin, tenant account, currency and whether the merchant has claimed the domain.",
    inputSchema: object({
      status: { type: "string", description: "active | unsupported | blocked | opted-out" },
      claimed: { type: "boolean", description: "Filter to claimed or unclaimed domains." },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    }),
    execute: async (env, input) => {
      const where: string[] = [];
      const args: unknown[] = [];
      const status = str(input, "status");
      if (status) { where.push("status = ?"); args.push(status); }
      if (typeof input.claimed === "boolean") {
        where.push(input.claimed ? "claimed_at IS NOT NULL" : "claimed_at IS NULL");
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const limit = Math.min(num(input, "limit") ?? 100, 500);
      const rows = await env.DB.prepare(
        `SELECT domain, status, platform, origin, account, merchant_name, currency, country,
                description, detected_at, claimed_at
           FROM domains ${clause} ORDER BY detected_at DESC LIMIT ?`,
      )
        .bind(...args, limit)
        .all();
      return { total: rows.results?.length ?? 0, domains: rows.results ?? [] };
    },
  },
];

tools.push({
  name: "upstream_probe",
  description:
    "Fetch a merchant catalog URL exactly the way the read path does and report what came back: status, content-type, size and the first bytes. Use it when a page renders as not-found but the same URL works from your laptop — storefronts behind a WAF routinely answer a Cloudflare Worker differently than they answer a browser, and this is the only way to see that.",
  inputSchema: object({ url: { type: "string", description: "Absolute https URL." } }, ["url"]),
  execute: async (_env, input) => {
    const raw = required(input, "url");
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      throw rpcError(-32602, "url must be absolute");
    }
    // Same guard the ingest path needs: never let an authenticated caller use
    // this Worker to reach something that is not a public storefront.
    if (target.protocol !== "https:") throw rpcError(-32602, "https only");
    if (/^(localhost|\[?::1\]?)$/i.test(target.hostname) ||
        /\.local$|\.internal$/i.test(target.hostname) ||
        /^(10|127|169\.254|192\.168)\./.test(target.hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(target.hostname)) {
      throw rpcError(-32602, "refusing a private host");
    }

    const started = Date.now();
    try {
      const res = await fetch(target, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      const body = await res.text();
      return {
        url: target.toString(),
        status: res.status,
        ms: Date.now() - started,
        contentType: res.headers.get("content-type"),
        cfRay: res.headers.get("cf-ray"),
        server: res.headers.get("server"),
        bytes: body.length,
        head: body.slice(0, 600),
      };
    } catch (err) {
      return {
        url: target.toString(),
        ms: Date.now() - started,
        threw: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

tools.push({
  name: "resolve_probe",
  description:
    "Run the read path for one domain and path, bypassing every cache, and report what the resolver actually decided: which API origin it called, the Doc kind it produced and how many products came back. This is the tool for 'the page says not found but the URL works when I try it'.",
  inputSchema: object(
    { domain: { type: "string" }, path: { type: "string" }, page: { type: "integer", minimum: 1 } },
    ["domain", "path"],
  ),
  execute: async (env, input) => {
    const domain = normalizeDomain(required(input, "domain"));
    if (!domain) throw rpcError(-32602, "domain is not a valid hostname");
    const row = await getDomain(env, domain);
    if (!row) throw rpcError(-32602, `${domain} is not in the registry yet`);

    const shop: Storefront = {
      domain,
      platform: row.platform,
      origin: row.origin ?? `https://www.${domain}`,
      name: row.merchant_name ?? undefined,
      account: row.account ?? undefined,
      currency: row.currency,
    };
    if (shop.platform === "vtex") {
      shop.apiOrigin = vtexApiOrigin(row.account ?? undefined, shop.origin);
    }

    const query = new URLSearchParams();
    const page = num(input, "page");
    if (page) query.set("page", String(page));

    const started = Date.now();
    const doc = await resolve(env, shop, required(input, "path"), query);
    return {
      shop: { platform: shop.platform, origin: shop.origin, apiOrigin: shop.apiOrigin, account: shop.account },
      ms: Date.now() - started,
      kind: doc.kind,
      products: doc.kind === "listing" ? doc.products.length : doc.kind === "product" ? 1 : 0,
      total: doc.kind === "listing" ? doc.total : undefined,
      categories: doc.kind === "home" ? doc.categories.length : undefined,
      title: doc.kind === "listing" ? doc.title : doc.kind === "product" ? doc.product.title : undefined,
    };
  },
});

export const toolByName = Object.fromEntries(tools.map((t) => [t.name, t]));
