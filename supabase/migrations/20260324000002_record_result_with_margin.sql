-- supabase/migrations/20260324000002_record_result_with_margin.sql
--
-- Replaces the record_result RPC to accept p_goal_difference.
-- The DEFAULT NULL is a backward-compat safety net for pre-feature callers only.
-- New code must always pass the value explicitly.
-- The RPC is passive — it writes whatever value it receives; no coercion.

CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL
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
  SET status = 'played',
      winner = p_winner,
      notes = p_notes,
      goal_difference = p_goal_difference
  WHERE id = p_week_id;
END;
$$;
