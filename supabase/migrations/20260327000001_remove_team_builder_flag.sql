-- Remove team_builder feature flag from all leagues and global experiments.
-- The Lineup Lab tab is now always visible; access is gated by authentication,
-- not a feature flag.

DELETE FROM league_features WHERE feature = 'team_builder';
DELETE FROM feature_experiments WHERE feature = 'team_builder';
