-- Allow game members to insert weeks and config for their games
CREATE POLICY "Game members insert weeks" ON weeks
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM game_members WHERE game_members.game_id = weeks.game_id AND game_members.user_id = auth.uid()));

CREATE POLICY "Game members insert config" ON config
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM game_members WHERE game_members.game_id = config.game_id AND game_members.user_id = auth.uid()));

-- Fix unique constraints: weeks and config should be unique per game
ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_season_week_key;
CREATE UNIQUE INDEX weeks_game_season_week_key ON weeks(game_id, season, week);

ALTER TABLE config DROP CONSTRAINT IF EXISTS config_key_key;
CREATE UNIQUE INDEX config_game_key_key ON config(game_id, key);
