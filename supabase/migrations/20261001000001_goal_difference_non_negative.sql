-- supabase/migrations/20261001000001_goal_difference_non_negative.sql

-- weeks.goal_difference is the unsigned win margin: 0 for a draw, NULL when
-- not recorded. The winner lives in weeks.winner, so a negative value is never
-- valid, and one would reverse every player's GD for that game in the quarter
-- tables. Members record results through the record_result RPC directly, so
-- the API route checks alone don't cover every write path.
--
-- Checked against production on 2026-10-01: no rows have a negative value.
ALTER TABLE weeks
  ADD CONSTRAINT weeks_goal_difference_non_negative
  CHECK (goal_difference IS NULL OR goal_difference >= 0);
