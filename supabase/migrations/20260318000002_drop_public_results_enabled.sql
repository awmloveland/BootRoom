-- supabase/migrations/20260318000002_drop_public_results_enabled.sql

-- Safe to drop: public league visibility is now derived from
-- league_features.public_enabled (per-feature) gated by
-- feature_experiments.available (global). Leagues that were
-- previously public retain their public_enabled flags on
-- league_features and will continue to be publicly visible.

ALTER TABLE games DROP COLUMN IF EXISTS public_results_enabled;
