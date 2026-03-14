-- ============================================================
-- Match entry RPCs for members.
-- When the match_entry feature flag is enabled, league members
-- (not just admins) can save lineups, record results, and cancel
-- scheduled weeks. Each function is SECURITY DEFINER so it can
-- bypass row-level-security after verifying the caller's access.
-- ============================================================

-- Helper: check if the current user can perform match entry
-- (either they are an admin, or they are a member and match_entry is enabled)
CREATE OR REPLACE FUNCTION can_do_match_entry(p_game_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_feature_enabled BOOLEAN;
  v_is_member BOOLEAN;
BEGIN
  SELECT is_game_admin(p_game_id) INTO v_is_admin;
  IF v_is_admin THEN RETURN TRUE; END IF;

  SELECT enabled INTO v_feature_enabled
  FROM league_features
  WHERE game_id = p_game_id AND feature = 'match_entry';

  IF NOT COALESCE(v_feature_enabled, false) THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) INTO v_is_member;

  RETURN v_is_member;
END;
$$;

-- ── save_lineup ──────────────────────────────────────────────
-- Upserts a scheduled week. Members can call this when match_entry
-- is enabled; admins can always call it.
CREATE OR REPLACE FUNCTION save_lineup(
  p_game_id  UUID,
  p_season   TEXT,
  p_week     INT,
  p_date     TEXT,
  p_format   TEXT,
  p_team_a   TEXT[],
  p_team_b   TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_id UUID;
BEGIN
  IF NOT can_do_match_entry(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO weeks (game_id, season, week, date, status, format, team_a, team_b, winner, notes)
  VALUES (p_game_id, p_season, p_week, p_date, 'scheduled', p_format, p_team_a, p_team_b, NULL, NULL)
  ON CONFLICT (game_id, season, week)
  DO UPDATE SET
    date   = EXCLUDED.date,
    format = EXCLUDED.format,
    team_a = EXCLUDED.team_a,
    team_b = EXCLUDED.team_b,
    status = 'scheduled'
  RETURNING id INTO v_week_id;

  RETURN v_week_id;
END;
$$;

-- ── record_result ────────────────────────────────────────────
-- Updates a scheduled week to played with a winner.
CREATE OR REPLACE FUNCTION record_result(
  p_week_id UUID,
  p_winner  TEXT,
  p_notes   TEXT DEFAULT NULL
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
  SET status = 'played', winner = p_winner, notes = p_notes
  WHERE id = p_week_id;
END;
$$;

-- ── cancel_lineup ─────────────────────────────────────────────
-- Deletes a scheduled week (resets the next match card to idle).
CREATE OR REPLACE FUNCTION cancel_lineup(p_week_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id UUID;
BEGIN
  SELECT game_id INTO v_game_id FROM weeks WHERE id = p_week_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT can_do_match_entry(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM weeks WHERE id = p_week_id;
END;
$$;
