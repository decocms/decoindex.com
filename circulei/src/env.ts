export interface Env {
  KV: KVNamespace;
  DB?: D1Database;
  INDEX?: Fetcher;
  SEARCH_LIMIT?: RateLimit;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
  CF_AI_GATEWAY_TOKEN?: string;
  PRESELECT_MODEL?: string;
  NOTE_MODEL?: string;
}
