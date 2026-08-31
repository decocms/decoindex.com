-- What agents tell us is wrong. This is the only channel through which the
-- service learns it produced a bad answer: nothing else on the read path can
-- tell the difference between "no products here" and "we parsed it wrong".
--
-- Submission is public and unauthenticated on purpose — an agent that hit a bad
-- page will not stop to get a key. Reading is private, over MCP.

CREATE TABLE IF NOT EXISTS feedback (
  id        TEXT PRIMARY KEY,
  ts        TEXT NOT NULL,
  domain    TEXT,                     -- merchant domain the report is about
  path      TEXT,                     -- the exact path that was tried
  kind      TEXT NOT NULL,            -- wrong_data|missing|broken|unsupported|other
  message   TEXT NOT NULL,            -- what went wrong, in the reporter's words
  expected  TEXT,                     -- what they expected instead
  ua_class  TEXT,                     -- openai|anthropic|script|... never the raw UA
  country   TEXT,
  status    TEXT NOT NULL DEFAULT 'new',  -- new|triaged|fixed|wontfix
  note      TEXT,                     -- our triage note
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS feedback_ts ON feedback(ts DESC);
CREATE INDEX IF NOT EXISTS feedback_status_ts ON feedback(status, ts DESC);
CREATE INDEX IF NOT EXISTS feedback_domain_ts ON feedback(domain, ts DESC);
