-- supabase/migrations/20260324000003_week_team_ratings.sql
--
-- Adds team_a_rating and team_b_rating snapshot columns to weeks.
-- Both nullable — historical games have no ratings.
-- Updates record_result RPC to accept and store the new params.

ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS team_a_rating NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS team_b_rating NUMERIC(6,3);

CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT    DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL,
  p_team_a_rating   NUMERIC DEFAULT NULL,
  p_team_b_rating   NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id UUID;
BEGIN
  SELECT game_id INTO v_game_id FROM weeks WHERE id = p_week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Week not found'; END IF;

  IF NOT can_do_match_entry(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE weeks
  SET status           = 'played',
      winner           = p_winner,
      notes            = p_notes,
      goal_difference  = p_goal_difference,
      team_a_rating    = p_team_a_rating,
      team_b_rating    = p_team_b_rating
  WHERE id = p_week_id;
END;
$$;
