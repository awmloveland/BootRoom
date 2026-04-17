-- 1. Drop the existing UNIQUE constraint on (season, week) — name varies by DB.
--    We find it dynamically to handle any naming.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'weeks'::regclass
    AND contype = 'u'
    AND array_to_string(
          ARRAY(
            SELECT attname FROM pg_attribute
            WHERE attrelid = conrelid
              AND attnum = ANY(conkey)
            ORDER BY attnum
          ), ','
        ) LIKE '%season%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE weeks DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

-- 2. Backfill season = calendar year extracted from date ('DD MMM YYYY' → 'YYYY')
UPDATE weeks
SET season = split_part(date, ' ', 3);

-- 3. Renumber weeks within each (game_id, season), preserving chronological order.
--    Uses the old sequential week number as the ordering key — correct because
--    weeks within a year were always in ascending order before this migration.
WITH renumbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY game_id, season
      ORDER BY week ASC
    )::int AS new_week
  FROM weeks
)
UPDATE weeks
SET week = renumbered.new_week
FROM renumbered
WHERE weeks.id = renumbered.id;

-- 4. Recreate the constraint scoped to (game_id, season, week).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'weeks'::regclass
      AND conname = 'weeks_game_season_week_key'
  ) THEN
    ALTER TABLE weeks ADD CONSTRAINT weeks_game_season_week_key UNIQUE (game_id, season, week);
  END IF;
END $$;
