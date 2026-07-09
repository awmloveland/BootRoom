-- Register the quarter_celebration feature as globally available
INSERT INTO feature_experiments (feature, available) VALUES
  ('quarter_celebration', true)
ON CONFLICT (feature) DO NOTHING;

-- Seed per-league rows for all existing leagues (admin-only by default)
INSERT INTO league_features (game_id, feature, enabled, public_enabled)
SELECT g.id, 'quarter_celebration', false, false
FROM games g
ON CONFLICT (game_id, feature) DO NOTHING;
