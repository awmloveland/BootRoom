-- supabase/migrations/20260330000002_sync_player_attributes_on_result.sql
--
-- Ensures every player who appears in a match result has a row in
-- player_attributes so they are visible in Settings → Players.
--
-- 1. Replaces record_result RPC to upsert player names after writing the result.
-- 2. Backfills any players already in match history who are missing a row.

CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT         DEFAULT NULL,
  p_goal_difference INTEGER      DEFAULT NULL,
  p_team_a_rating   NUMERIC(6,3) DEFAULT NULL,
  p_team_b_rating   NUMERIC(6,3) DEFAULT NULL
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

  -- Upsert all players from this match into player_attributes.
  -- ON CONFLICT DO NOTHING preserves existing eye test ratings and mentalities.
  INSERT INTO player_attributes (game_id, name)
  SELECT v_game_id, player_name
  FROM (
    SELECT jsonb_array_elements_text(team_a) AS player_name FROM weeks WHERE id = p_week_id
    UNION
    SELECT jsonb_array_elements_text(team_b) AS player_name FROM weeks WHERE id = p_week_id
  ) players
  ON CONFLICT (game_id, name) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_result(UUID, TEXT, TEXT, INTEGER, NUMERIC(6,3), NUMERIC(6,3)) TO authenticated;

-- Backfill: create player_attributes rows for players already in match history
-- who have no row. Safe to run multiple times — ON CONFLICT DO NOTHING is idempotent.
INSERT INTO player_attributes (game_id, name)
SELECT DISTINCT w.game_id, player_name
FROM weeks w,
  LATERAL (
    SELECT jsonb_array_elements_text(w.team_a) AS player_name
    UNION
    SELECT jsonb_array_elements_text(w.team_b) AS player_name
  ) players
WHERE w.status = 'played'
ON CONFLICT (game_id, name) DO NOTHING;
