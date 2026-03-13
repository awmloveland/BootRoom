-- Add game_id to weeks and config (link data to games)
ALTER TABLE weeks ADD COLUMN game_id uuid REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE config ADD COLUMN game_id uuid REFERENCES games(id) ON DELETE CASCADE;

-- Insert legacy game "The Boot Room" (id will be used for backfill)
-- We use a known uuid so the seed script can reference it
INSERT INTO games (id, name, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'The Boot Room',
  NULL  -- Will be set when user runs seed script
);

-- Backfill existing weeks and config with the legacy game
UPDATE weeks SET game_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE game_id IS NULL;
UPDATE config SET game_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE game_id IS NULL;

ALTER TABLE weeks ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE config ALTER COLUMN game_id SET NOT NULL;

-- Drop old RLS policies that used profiles
DROP POLICY IF EXISTS "Profiled users read weeks" ON weeks;
DROP POLICY IF EXISTS "Profiled users read config" ON config;

-- New RLS: user must be game member to read weeks/config
CREATE POLICY "Game members read weeks" ON weeks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM game_members WHERE game_members.game_id = weeks.game_id AND game_members.user_id = auth.uid()));

CREATE POLICY "Game members read config" ON config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM game_members WHERE game_members.game_id = config.game_id AND game_members.user_id = auth.uid()));
