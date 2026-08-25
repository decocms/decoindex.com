-- Global registry + first-party analytics. Per-storefront catalog data lives
-- in the Durable Object, not here.

CREATE TABLE IF NOT EXISTS domains (
  domain        TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'queued',   -- queued|discovered|merchant-verified|opted-out
  platform      TEXT NOT NULL DEFAULT 'unknown',
  priority      INTEGER NOT NULL DEFAULT 10,      -- 100 = seeded, 10 = discovered on demand
  product_count INTEGER NOT NULL DEFAULT 0,
  last_refresh  TEXT,
  last_error    TEXT
);
CREATE INDEX IF NOT EXISTS domains_refresh ON domains(priority DESC, last_refresh ASC);

-- Append-only. Pruned past 90 days by cron.
CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL,
  name     TEXT NOT NULL,
  domain   TEXT,
  surface  TEXT,        -- product|search|brand|llms|catalog|category
  ua_class TEXT,        -- openai|anthropic|perplexity|script|browser|...
  country  TEXT,
  ms       INTEGER,
  meta     TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS events_name_ts ON events(name, ts);
CREATE INDEX IF NOT EXISTS events_ua ON events(ua_class, ts);

-- Claimed domains. A merchant proving control of the domain upgrades its
-- index_status and lets merchant-provided data override crawled data.
CREATE TABLE IF NOT EXISTS claims (
  domain      TEXT PRIMARY KEY,
  claimed_by  TEXT NOT NULL,
  method      TEXT NOT NULL,   -- dns-txt|email|deco-account
  verified_at TEXT NOT NULL
);
