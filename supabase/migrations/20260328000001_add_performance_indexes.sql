-- Performance: add indexes missing from later migrations.
-- weeks(game_id, status) covers both common filter patterns:
--   WHERE game_id = X
--   WHERE game_id = X AND status = 'played'
-- config(game_id) covers the config lookup inside get_player_stats_public.

CREATE INDEX IF NOT EXISTS idx_weeks_game_id_status ON weeks(game_id, status);
CREATE INDEX IF NOT EXISTS idx_config_game_id ON config(game_id);
