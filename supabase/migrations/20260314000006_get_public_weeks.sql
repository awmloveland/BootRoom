-- ============================================================
-- get_public_weeks: SECURITY DEFINER RPC for reading weeks
-- on leagues with public_results_enabled = true.
--
-- NOTE: This function was created manually in the Supabase SQL
-- editor on 2026-03-14. This migration file tracks it for the
-- repo history. The public results page now uses the service
-- role client directly instead of this RPC, but the function
-- remains in the DB as a fallback.
-- ============================================================

CREATE OR REPLACE FUNCTION get_public_weeks(p_game_id UUID)
RETURNS TABLE (
  week    INT,
  date    TEXT,
  status  TEXT,
  format  TEXT,
  team_a  TEXT[],
  team_b  TEXT[],
  winner  TEXT,
  notes   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM games WHERE id = p_game_id AND public_results_enabled = true
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    w.week,
    w.date,
    w.status::TEXT,
    w.format,
    w.team_a,
    w.team_b,
    w.winner::TEXT,
    w.notes
  FROM weeks w
  WHERE w.game_id = p_game_id
    AND w.status IN ('played', 'cancelled')
  ORDER BY w.week DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_weeks(UUID) TO anon;
