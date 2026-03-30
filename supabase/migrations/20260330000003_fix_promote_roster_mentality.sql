-- supabase/migrations/20260330000003_fix_promote_roster_mentality.sql
--
-- Updates promote_roster to also persist mentality when a new player is confirmed
-- during result entry. Previously mentality was hardcoded to 'balanced' on insert
-- and not updated at all on conflict.

CREATE OR REPLACE FUNCTION promote_roster(
  p_game_id UUID,
  p_entries JSONB  -- array of {name: text, rating: int, mentality: text, goalkeeper?: bool}
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
    COALESCE((e->>'mentality')::text, 'balanced'),
    COALESCE((e->>'goalkeeper')::boolean, false)
  FROM jsonb_array_elements(p_entries) AS e
  ON CONFLICT (game_id, name) DO UPDATE
    SET rating     = EXCLUDED.rating,
        goalkeeper = EXCLUDED.goalkeeper,
        mentality  = EXCLUDED.mentality;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_roster(UUID, JSONB) TO authenticated;
