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
