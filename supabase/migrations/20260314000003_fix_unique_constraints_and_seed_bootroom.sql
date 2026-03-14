-- ============================================================
-- Fix unique constraints broken by multi-game migration, and
-- seed Boot Room with league_features.
-- ============================================================


-- ------------------------------------------------------------
-- 1. weeks: drop old UNIQUE(season, week), add UNIQUE(game_id, season, week)
--    The original schema had a single-league unique constraint.
--    Multi-game support requires game_id in the key.
-- ------------------------------------------------------------
ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_season_week_key;

ALTER TABLE weeks
  ADD CONSTRAINT weeks_game_id_season_week_key
  UNIQUE (game_id, season, week);


-- ------------------------------------------------------------
-- 2. config: drop old UNIQUE(key), add UNIQUE(game_id, key)
--    Without this, only one league can ever have key = 'config'.
-- ------------------------------------------------------------
ALTER TABLE config DROP CONSTRAINT IF EXISTS config_key_key;

ALTER TABLE config
  ADD CONSTRAINT config_game_id_key_key
  UNIQUE (game_id, key);


-- ------------------------------------------------------------
-- 3. Seed league_features for The Boot Room (legacy game).
--    create_game RPC seeds these for new leagues; the Boot Room
--    pre-dates that change and needs backfilling.
-- ------------------------------------------------------------
INSERT INTO league_features (game_id, feature, enabled, config) VALUES
  (
    '9cf13e81-4382-428b-a4ec-c94cb8e2567e'::uuid,
    'match_entry',
    true,
    NULL
  ),
  (
    '9cf13e81-4382-428b-a4ec-c94cb8e2567e'::uuid,
    'team_builder',
    true,
    NULL
  ),
  (
    '9cf13e81-4382-428b-a4ec-c94cb8e2567e'::uuid,
    'player_stats',
    true,
    '{"max_players": null, "visible_stats": ["played","won","drew","lost","winRate","recentForm"]}'::jsonb
  ),
  (
    '9cf13e81-4382-428b-a4ec-c94cb8e2567e'::uuid,
    'player_comparison',
    false,
    NULL
  )
ON CONFLICT (game_id, feature) DO NOTHING;
