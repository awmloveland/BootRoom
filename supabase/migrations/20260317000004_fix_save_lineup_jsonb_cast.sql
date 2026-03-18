-- Fix save_lineup: team_a and team_b are jsonb columns, so TEXT[] params
-- must be explicitly cast with to_jsonb() before inserting.
-- Without this, the INSERT fails with "cannot cast type text[] to jsonb".
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
  VALUES (p_game_id, p_season, p_week, p_date, 'scheduled', p_format, to_jsonb(p_team_a), to_jsonb(p_team_b), NULL, NULL)
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
