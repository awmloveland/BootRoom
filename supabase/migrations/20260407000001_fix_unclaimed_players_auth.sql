-- supabase/migrations/20260407000001_fix_unclaimed_players_auth.sql
--
-- The join dialog calls get_unclaimed_players before the user is a league member.
-- The previous game_members check always returned 'Access denied' for non-members,
-- causing "Failed to load player names" in the join flow.
-- Player names come from weeks.team_a / team_b which are already visible in public
-- match results, so authentication-only access is appropriate.
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

  -- Player names are derived from match data already visible in public results.
  RETURN QUERY
  SELECT DISTINCT p.name
  FROM weeks w
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(w.team_a) AS name
    UNION
    SELECT jsonb_array_elements_text(w.team_b) AS name
  ) p
  WHERE w.game_id = p_game_id
    AND w.status = 'played'
    AND NOT EXISTS (
      SELECT 1 FROM player_claims pc
      WHERE pc.game_id = p_game_id
        AND pc.player_name = p.name
        AND pc.status IN ('pending', 'approved')
    )
  ORDER BY p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unclaimed_players(uuid) TO authenticated;
