-- supabase/migrations/20260408000001_add_first_last_name.sql

ALTER TABLE profiles
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text;

-- Backfill: split existing display_name on the first space.
-- Users with no space get first_name = full display_name, last_name = null.
UPDATE profiles
SET
  first_name = split_part(display_name, ' ', 1),
  last_name  = CASE
    WHEN display_name ~ ' '
    THEN nullif(trim(substring(display_name FROM position(' ' IN display_name) + 1)), '')
    ELSE NULL
  END
WHERE display_name IS NOT NULL AND display_name != '';
