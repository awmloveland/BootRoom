-- Remove the stats_sidebar feature flag.
-- The sidebar / FAB are now unconditional UI; the flag is dead config.

DELETE FROM league_features    WHERE feature = 'stats_sidebar';
DELETE FROM feature_experiments WHERE feature = 'stats_sidebar';
