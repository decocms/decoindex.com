-- The registry: which domains we know and how to talk to their platform.
-- Rendered documents live in KV, not here. This table is small on purpose —
-- it is read once per cache miss and never on a hit.

CREATE TABLE IF NOT EXISTS domains (
  domain        TEXT PRIMARY KEY,           -- normalized: lowercase, no scheme, no www
  status        TEXT NOT NULL DEFAULT 'active',  -- active|unsupported|blocked|opted-out
  platform      TEXT NOT NULL DEFAULT 'unknown', -- vtex|shopify|unknown
  origin        TEXT,                       -- the origin that actually answered (www or apex)
  account       TEXT,                       -- platform tenant id: vtex account, myshopify domain
  merchant_name TEXT,
  currency      TEXT NOT NULL DEFAULT 'BRL',
  country       TEXT,
  detected_at   TEXT,
  last_error    TEXT
);

-- Append-only. Pruned past 90 days by hand.
CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL,
  name     TEXT NOT NULL,
  domain   TEXT,
  surface  TEXT,        -- product|listing|home|llms|landing
  ua_class TEXT,        -- openai|anthropic|perplexity|script|browser|...
  country  TEXT,
  ms       INTEGER,
  meta     TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS events_name_ts ON events(name, ts);
CREATE INDEX IF NOT EXISTS events_ua ON events(ua_class, ts);
