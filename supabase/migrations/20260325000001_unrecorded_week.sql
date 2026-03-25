-- supabase/migrations/20260325000001_unrecorded_week.sql
--
-- Adds 'unrecorded' status for game weeks that elapsed with no action.
-- The 'played' value must remain — record_result sets status = 'played'.
--
-- NOTE: save_lineup unconditionally upserts status = 'scheduled' on conflict,
-- so it would overwrite an unrecorded row if a lineup were built retroactively.
-- Admins retroactively adding a lineup to an unrecorded week is out of scope.

ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_status_check;
ALTER TABLE weeks ADD CONSTRAINT weeks_status_check
  CHECK (status IN ('scheduled', 'cancelled', 'unrecorded', 'played'));

-- ── create_unrecorded_week ────────────────────────────────────────────────────
-- Creates a placeholder row for a game week that passed with no lineup or cancel.
-- Called via service client from the server — no auth check needed here.
-- ON CONFLICT DO NOTHING makes it safe to call on every page load.
CREATE OR REPLACE FUNCTION create_unrecorded_week(
  p_game_id UUID,
  p_season  TEXT,
  p_week    INT,
  p_date    TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO weeks (game_id, season, week, date, status, team_a, team_b)
  VALUES (p_game_id, p_season, p_week, p_date, 'unrecorded', '[]', '[]')
  ON CONFLICT (game_id, season, week) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
