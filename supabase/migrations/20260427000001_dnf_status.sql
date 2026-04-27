-- supabase/migrations/20260427000001_dnf_status.sql
--
-- Adds 'dnf' (Did Not Finish) to the weeks.status check constraint.
-- Updates record_result RPC: p_dnf=true sets status='dnf', preserves lineups,
-- clears winner and goal_difference.
-- Updates edit_week RPC: handles 'dnf' status — preserves lineups, clears result fields.

-- 1. Update CHECK constraint
ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_status_check;
ALTER TABLE weeks ADD CONSTRAINT weeks_status_check
  CHECK (status IN ('played', 'cancelled', 'scheduled', 'unrecorded', 'dnf'));

-- 2. Replace record_result RPC
DROP FUNCTION IF EXISTS public.record_result(UUID, TEXT, TEXT, INTEGER, NUMERIC(6,3), NUMERIC(6,3));

CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT         DEFAULT NULL,
  p_goal_difference INTEGER      DEFAULT NULL,
  p_team_a_rating   NUMERIC(6,3) DEFAULT NULL,
  p_team_b_rating   NUMERIC(6,3) DEFAULT NULL,
  p_dnf             BOOLEAN      DEFAULT FALSE
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

  IF p_dnf THEN
    UPDATE weeks
    SET status          = 'dnf',
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;

    -- Upsert all players from this match into player_attributes.
    -- Participants are real league members either way (played or dnf).
    INSERT INTO player_attributes (game_id, name)
    SELECT v_game_id, player_name
    FROM (
      SELECT jsonb_array_elements_text(team_a) AS player_name FROM weeks WHERE id = p_week_id
      UNION
      SELECT jsonb_array_elements_text(team_b) AS player_name FROM weeks WHERE id = p_week_id
    ) players
    ON CONFLICT (game_id, name) DO NOTHING;
  ELSE
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
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_result(UUID, TEXT, TEXT, INTEGER, NUMERIC(6,3), NUMERIC(6,3), BOOLEAN) TO authenticated;

-- 3. Replace edit_week RPC
CREATE OR REPLACE FUNCTION edit_week(
  p_week_id         UUID,
  p_date            TEXT,
  p_status          TEXT,
  p_winner          TEXT    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL,
  p_team_a          JSONB   DEFAULT NULL,
  p_team_b          JSONB   DEFAULT NULL
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

  IF NOT is_game_admin(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_status NOT IN ('played', 'cancelled', 'unrecorded', 'dnf') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be played, cancelled, unrecorded, or dnf', p_status;
  END IF;

  IF p_status = 'played' THEN
    UPDATE weeks
    SET date            = p_date,
        status          = 'played',
        winner          = p_winner,
        notes           = p_notes,
        goal_difference = p_goal_difference,
        team_a          = COALESCE(p_team_a, '[]'::jsonb),
        team_b          = COALESCE(p_team_b, '[]'::jsonb),
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  ELSIF p_status = 'dnf' THEN
    -- Preserve lineups (use incoming value or keep existing), clear result fields
    UPDATE weeks
    SET date            = p_date,
        status          = 'dnf',
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a          = COALESCE(p_team_a, team_a),
        team_b          = COALESCE(p_team_b, team_b),
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  ELSE
    UPDATE weeks
    SET date            = p_date,
        status          = p_status,
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a          = '[]'::jsonb,
        team_b          = '[]'::jsonb,
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_week(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, JSONB) TO authenticated;
