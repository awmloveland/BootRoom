-- supabase/migrations/20260321000002_goalkeeper_on_promote_roster.sql
-- Update promote_roster to read and persist the goalkeeper flag from JSON entries.
-- Entries now accept: {name: text, rating: int, goalkeeper: bool (optional, default false)}

CREATE OR REPLACE FUNCTION promote_roster(
  p_game_id UUID,
  p_entries JSONB  -- array of {name: text, rating: int, goalkeeper?: bool}
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
    COALESCE((e->>'goalkeeper')::boolean, false)
  FROM jsonb_array_elements(p_entries) AS e
  ON CONFLICT (game_id, name) DO UPDATE
    SET rating     = EXCLUDED.rating,
        goalkeeper = EXCLUDED.goalkeeper;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_roster(UUID, JSONB) TO authenticated;
