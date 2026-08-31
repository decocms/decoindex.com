-- How the merchant describes itself, read once from the tags they already
-- publish for Google and link previews. Attributed, never rewritten — and
-- replaced by merchant-controlled CMS fields once they sign up.

ALTER TABLE domains ADD COLUMN description TEXT;
ALTER TABLE domains ADD COLUMN logo_url TEXT;
ALTER TABLE domains ADD COLUMN theme_color TEXT;
ALTER TABLE domains ADD COLUMN locale TEXT;
-- Null means "never looked". Lets a later pass find domains detected before
-- brand extraction existed, without re-reading the ones that simply have none.
ALTER TABLE domains ADD COLUMN brand_checked_at TEXT;
