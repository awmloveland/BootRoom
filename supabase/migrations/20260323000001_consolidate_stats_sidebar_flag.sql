-- Consolidate three per-widget stats flags into a single stats_sidebar flag.

-- 1. Register the new unified flag globally
INSERT INTO feature_experiments (feature, available)
VALUES ('stats_sidebar', true)
ON CONFLICT (feature) DO NOTHING;

-- 2. Seed stats_sidebar for all leagues (enabled=true, public_enabled=true)
INSERT INTO league_features (game_id, feature, enabled, public_enabled)
SELECT id, 'stats_sidebar', true, true
FROM games
ON CONFLICT (game_id, feature) DO NOTHING;

-- 3. Remove old per-widget rows from league_features
DELETE FROM league_features
WHERE feature IN ('stats_in_form', 'stats_quarterly_table', 'stats_team_ab');

-- 4. Remove old per-widget flags from feature_experiments
DELETE FROM feature_experiments
WHERE feature IN ('stats_in_form', 'stats_quarterly_table', 'stats_team_ab');
