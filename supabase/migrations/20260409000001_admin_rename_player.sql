-- supabase/migrations/20260409000001_admin_rename_player.sql
--
-- admin_rename_player: atomically renames a player across all league data.
-- Updates player_attributes, player_claims, and weeks.team_a / team_b.
-- Raises 'name_already_exists' if p_new_name is already taken in the league.
--

CREATE OR REPLACE FUNCTION public.admin_rename_player(
  p_game_id  uuid,
  p_old_name text,
  p_new_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin gate
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- No-op if names are identical
  IF p_old_name = p_new_name THEN
    RETURN;
  END IF;

  -- Conflict check: new name must not already exist in player_attributes
  IF EXISTS (
    SELECT 1 FROM player_attributes
    WHERE game_id = p_game_id AND name = p_new_name
  ) THEN
    RAISE EXCEPTION 'name_already_exists';
  END IF;

  -- Update player_attributes
  UPDATE player_attributes
  SET name = p_new_name
  WHERE game_id = p_game_id AND name = p_old_name;

  -- Update player_claims.player_name
  UPDATE player_claims
  SET player_name = p_new_name
  WHERE game_id = p_game_id AND player_name = p_old_name;

  -- Update player_claims.admin_override_name
  UPDATE player_claims
  SET admin_override_name = p_new_name
  WHERE game_id = p_game_id AND admin_override_name = p_old_name;

  -- Update weeks.team_a and team_b JSONB arrays
  UPDATE weeks
  SET
    team_a = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_a) AS val
    ),
    team_b = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_b) AS val
    )
  WHERE game_id = p_game_id
    AND (team_a @> to_jsonb(p_old_name) OR team_b @> to_jsonb(p_old_name));

END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rename_player(uuid, text, text) TO authenticated;
