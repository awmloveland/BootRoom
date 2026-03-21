-- supabase/migrations/20260321000001_guest_new_player_flow.sql

-- 1. Add lineup_metadata column to weeks (nullable, backwards-compatible)
ALTER TABLE weeks ADD COLUMN IF NOT EXISTS lineup_metadata jsonb DEFAULT NULL;

-- 2. Replace save_lineup RPC to accept and store lineup_metadata
CREATE OR REPLACE FUNCTION save_lineup(
  p_game_id        UUID,
  p_season         TEXT,
  p_week           INT,
  p_date           TEXT,
  p_format         TEXT,
  p_team_a         TEXT[],
  p_team_b         TEXT[],
  p_lineup_metadata JSONB DEFAULT NULL
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

  INSERT INTO weeks (game_id, season, week, date, status, format, team_a, team_b, winner, notes, lineup_metadata)
  VALUES (p_game_id, p_season, p_week, p_date, 'scheduled', p_format, to_jsonb(p_team_a), to_jsonb(p_team_b), NULL, NULL, p_lineup_metadata)
  ON CONFLICT (game_id, season, week)
  DO UPDATE SET
    date             = EXCLUDED.date,
    format           = EXCLUDED.format,
    team_a           = EXCLUDED.team_a,
    team_b           = EXCLUDED.team_b,
    status           = 'scheduled',
    lineup_metadata  = EXCLUDED.lineup_metadata
  RETURNING id INTO v_week_id;

  RETURN v_week_id;
END;
$$;

-- 3. Add promote_roster RPC — allows members to write to player_attributes
--    (which is otherwise admin-only via RLS)
CREATE OR REPLACE FUNCTION promote_roster(
  p_game_id UUID,
  p_entries JSONB  -- array of {name: text, rating: int} objects
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_do_match_entry(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
  SELECT
    p_game_id,
    (e->>'name')::text,
    (e->>'rating')::int,
    'balanced',
    false
  FROM jsonb_array_elements(p_entries) AS e
  ON CONFLICT (game_id, name) DO UPDATE
    SET rating = EXCLUDED.rating;
END;
$$;
