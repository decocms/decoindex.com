-- The improvement loop. No MCP server in v1, so the agent reads these through
-- `wrangler d1 execute` rather than a tool call. Same data, one less surface.

CREATE TABLE IF NOT EXISTS goals (
  name        TEXT PRIMARY KEY,
  metric      TEXT NOT NULL,      -- an event name from `events`
  target      REAL NOT NULL,
  direction   TEXT NOT NULL DEFAULT 'up',  -- up|down
  window_days INTEGER NOT NULL DEFAULT 7,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,       -- observation|decision|result|lesson
  body       TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_kind ON memories(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS hypotheses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  statement   TEXT NOT NULL,      -- "If we X, then <metric> moves, because Y"
  metric      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'proposed', -- proposed|testing|confirmed|refuted
  author      TEXT NOT NULL,
  reviewed_by TEXT,               -- must differ from author to confirm/refute
  created_at  TEXT NOT NULL,
  concluded_at TEXT,
  result      TEXT
);
CREATE INDEX IF NOT EXISTS hypotheses_status ON hypotheses(status);

-- Seed the two goals that decide whether this service exists at all.
INSERT OR IGNORE INTO goals (name, metric, target, direction, window_days, created_at)
VALUES
  ('agent_reads_weekly', 'read', 5000, 'up', 7, datetime('now')),
  ('search_share', 'read', 0.25, 'up', 7, datetime('now'));
