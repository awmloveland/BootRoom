-- Register the three stats features as globally available
INSERT INTO feature_experiments (feature, available) VALUES
  ('stats_in_form',         true),
  ('stats_quarterly_table', true),
  ('stats_team_ab',         true)
ON CONFLICT (feature) DO NOTHING;

-- Seed per-league rows for all existing leagues (admin-only by default)
INSERT INTO league_features (game_id, feature, enabled, public_enabled)
SELECT g.id, feat, false, false
FROM games g
CROSS JOIN (VALUES
  ('stats_in_form'),
  ('stats_quarterly_table'),
  ('stats_team_ab')
) AS t(feat)
ON CONFLICT (game_id, feature) DO NOTHING;
