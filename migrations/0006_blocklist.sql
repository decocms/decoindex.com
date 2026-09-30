-- Clients refused with 403, beyond the named crawlers in lib/robots.ts. A rule
-- is one network plus one exact user-agent string: narrow enough that blocking a
-- crawler on AWS does not block every agent a developer runs on AWS.
--
-- Written by the hourly scraper sweep (source 'auto', expires after 7 days so a
-- false positive heals on its own) or by hand (source 'manual', may be permanent).

CREATE TABLE IF NOT EXISTS blocklist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asn         INTEGER NOT NULL DEFAULT 0,  -- 0 = any network
  aso         TEXT,                        -- network name, for humans
  ua          TEXT NOT NULL,               -- exact user-agent, as stored in events.meta.ua
  source      TEXT NOT NULL,               -- auto | manual
  reason      TEXT NOT NULL,
  reads       INTEGER,                     -- evidence at the time of the block:
  paths       INTEGER,                     --   reads and distinct paths in the hour
  created_at  TEXT NOT NULL,
  expires_at  TEXT,                        -- NULL = permanent
  UNIQUE (asn, ua)
);
