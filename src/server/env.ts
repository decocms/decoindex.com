import type { StorefrontDO } from "./do/storefront";

export interface Env {
  // Durable Objects
  STOREFRONT: DurableObjectNamespace<StorefrontDO>;

  // Storage
  DB: D1Database;
  LOCKS: KVNamespace;
  SNAPSHOTS: R2Bucket;

  // Async
  INGEST: Queue<IngestJob>;

  // Inference
  AI: Ai;

  // Vars
  PUBLIC_ORIGIN: string;
  ATTRIBUTION_PARAM: string;
  ATTRIBUTION_VALUE: string;
  EMBEDDING_MODEL: string;

  // Secrets (optional -> features degrade instead of crashing)
  ADMIN_TOKEN?: string;
}

export type IngestJob =
  | { kind: "discover"; domain: string; priority?: "high" | "low" }
  | { kind: "catalog"; domain: string; cursor?: number }
  | { kind: "embed"; domain: string; skuIds: string[] }
  | { kind: "page"; domain: string; path: string };
