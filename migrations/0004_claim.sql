-- A claimed domain is one whose merchant has signed up. Claimed storefronts get
-- merchant-controlled data and no promotional footer; unclaimed ones carry a
-- short note about who runs this service and how to take control of the page.
--
-- Nothing sets this yet — claiming is a human conversation today (see /opt-out).
-- The column exists so the read path can already branch on it.

ALTER TABLE domains ADD COLUMN claimed_at TEXT;
ALTER TABLE domains ADD COLUMN claimed_by TEXT;
