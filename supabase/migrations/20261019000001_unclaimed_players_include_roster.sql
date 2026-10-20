-- supabase/migrations/20261019000001_unclaimed_players_include_roster.sql
--
-- get_unclaimed_players built its list from played line-ups only, so a roster
-- player who had not played yet (added via Settings → Players "+ Add player")
-- could not be linked from the Members list or claimed in the join dialog.
-- Player stats already start from player_attributes (20260513000001); this
-- brings the claim list in line by including roster names alongside names
-- from played weeks.
--
CREATE OR REPLACE FUNCTION public.get_unclaimed_players(p_game_id uuid)
RETURNS TABLE (player_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Player names are already visible in public results and the Players tab.
  RETURN QUERY
  SELECT p.name
  FROM (
    SELECT jsonb_array_elements_text(w.team_a) AS name
    FROM weeks w
    WHERE w.game_id = p_game_id AND w.status = 'played'
    UNION
    SELECT jsonb_array_elements_text(w.team_b) AS name
    FROM weeks w
    WHERE w.game_id = p_game_id AND w.status = 'played'
    UNION
    SELECT pa.name
    FROM player_attributes pa
    WHERE pa.game_id = p_game_id
  ) p
  WHERE NOT EXISTS (
    SELECT 1 FROM player_claims pc
    WHERE pc.game_id = p_game_id
      AND pc.player_name = p.name
      AND pc.status IN ('pending', 'approved')
  )
  ORDER BY p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unclaimed_players(uuid) TO authenticated;
