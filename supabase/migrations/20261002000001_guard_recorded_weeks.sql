-- supabase/migrations/20261002000001_guard_recorded_weeks.sql
--
-- Defence in depth for the January rollover bug: save_lineup and cancel_week
-- upsert on (game_id, season, week), so a wrong week key would silently
-- overwrite a game that already has a result. Both now refuse to touch a row
-- whose status is 'played' or 'dnf'.
--
-- Bodies are copied from 20260330000001_save_lineup_ratings.sql and
-- 20260317000003_cancel_week.sql; only the guard block is new.

CREATE OR REPLACE FUNCTION save_lineup(
  p_game_id          UUID,
  p_season           TEXT,
  p_week             INT,
  p_date             TEXT,
  p_format           TEXT,
  p_team_a           TEXT[],
  p_team_b           TEXT[],
  p_lineup_metadata  JSONB         DEFAULT NULL,
  p_team_a_rating    NUMERIC(6,3)  DEFAULT NULL,
  p_team_b_rating    NUMERIC(6,3)  DEFAULT NULL
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

  IF EXISTS (
    SELECT 1 FROM weeks
    WHERE game_id = p_game_id AND season = p_season AND week = p_week
      AND status IN ('played', 'dnf')
  ) THEN
    RAISE EXCEPTION 'Week % of season % already has a result', p_week, p_season;
  END IF;

  INSERT INTO weeks (
    game_id, season, week, date, status, format,
    team_a, team_b, winner, notes, lineup_metadata,
    team_a_rating, team_b_rating
  )
  VALUES (
    p_game_id, p_season, p_week, p_date, 'scheduled', p_format,
    to_jsonb(p_team_a), to_jsonb(p_team_b), NULL, NULL, p_lineup_metadata,
    p_team_a_rating, p_team_b_rating
  )
  ON CONFLICT (game_id, season, week)
  DO UPDATE SET
    date             = EXCLUDED.date,
    format           = EXCLUDED.format,
    team_a           = EXCLUDED.team_a,
    team_b           = EXCLUDED.team_b,
    status           = 'scheduled',
    lineup_metadata  = EXCLUDED.lineup_metadata,
    team_a_rating    = EXCLUDED.team_a_rating,
    team_b_rating    = EXCLUDED.team_b_rating
  RETURNING id INTO v_week_id;

  RETURN v_week_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_lineup(
  UUID, TEXT, INT, TEXT, TEXT, TEXT[], TEXT[], JSONB, NUMERIC(6,3), NUMERIC(6,3)
) TO authenticated;

-- cancel_week: create or update the upcoming week as 'cancelled'.
-- Calling cancel_lineup (DELETE) on the returned week id reactivates it.
CREATE OR REPLACE FUNCTION public.cancel_week(
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
  IF NOT can_do_match_entry(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM weeks
    WHERE game_id = p_game_id AND season = p_season AND week = p_week
      AND status IN ('played', 'dnf')
  ) THEN
    RAISE EXCEPTION 'Week % of season % already has a result', p_week, p_season;
  END IF;

  INSERT INTO weeks (game_id, season, week, date, status, team_a, team_b)
  VALUES (p_game_id, p_season, p_week, p_date, 'cancelled', '[]', '[]')
  ON CONFLICT (game_id, season, week) DO UPDATE
    SET status  = 'cancelled',
        team_a  = '[]',
        team_b  = '[]',
        winner  = NULL,
        notes   = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_week(UUID, TEXT, INT, TEXT) TO authenticated;
