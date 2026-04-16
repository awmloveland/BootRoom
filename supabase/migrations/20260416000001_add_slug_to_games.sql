-- Step 1: Add nullable slug column
ALTER TABLE games ADD COLUMN IF NOT EXISTS slug text;

-- Step 2: Backfill slugs from existing names using the same rules as generateSlug():
--   lowercase, non-alphanumeric runs → hyphens, strip leading/trailing hyphens.
-- Handles collisions by appending -2, -3, etc.
DO $$
DECLARE
  rec RECORD;
  base_slug text;
  candidate text;
  counter int;
BEGIN
  FOR rec IN SELECT id, name FROM games WHERE slug IS NULL ORDER BY created_at LOOP
    base_slug := lower(regexp_replace(trim(both '-' from regexp_replace(rec.name, '[^a-zA-Z0-9]+', '-', 'g')), '^-+|-+$', '', 'g'));
    candidate := base_slug;
    counter := 2;
    WHILE EXISTS (SELECT 1 FROM games WHERE slug = candidate AND id != rec.id) LOOP
      candidate := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    UPDATE games SET slug = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- Step 3: Apply NOT NULL and UNIQUE constraints
ALTER TABLE games ALTER COLUMN slug SET NOT NULL;
ALTER TABLE games ADD CONSTRAINT games_slug_unique UNIQUE (slug);
CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug);
