-- supabase/migrations/20260324000001_add_goal_difference.sql

-- Add goal_difference column to weeks.
-- DEFAULT NULL written explicitly for clarity; this is also the PostgreSQL default.
ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS goal_difference integer DEFAULT NULL;

-- Backfill from notes where the pattern "+N goals" appears at the START of the string.
-- The ^ anchor is intentional: notes with the pattern mid-sentence stay NULL.
-- Known historic format: "+3 Goals", "+1 goal" at start of notes field.
-- The WHERE filter and SET both run the regex intentionally:
--   WHERE guards the UPDATE; regexp_match extracts the value.
UPDATE weeks
SET goal_difference = (regexp_match(notes, '^\+(\d+)\s*goals?', 'i'))[1]::integer
WHERE status = 'played'
  AND notes IS NOT NULL
  AND notes ~* '^\+(\d+)\s*goals?';
-- notes IS NOT NULL guard is required: regex operators on NULL produce NULL (not false),
-- which could cause unexpected behaviour in some Postgres versions. Explicit is safer.
