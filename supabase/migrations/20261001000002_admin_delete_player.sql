-- supabase/migrations/20261001000002_admin_delete_player.sql
--
-- admin_delete_player: removes a player from a league's roster.
-- Deletes the player_attributes row, which drops them from the Players tab,
-- Settings → Players and the team builder (all read from player_attributes).
-- Also deletes any pending/approved claim resolving to this player so no
-- member stays linked to a player that no longer exists.
-- Match history (weeks.team_a / team_b) is left untouched.
-- Raises 'player_not_found' if the player is not on the roster.
--

CREATE OR REPLACE FUNCTION public.admin_delete_player(
  p_game_id uuid,
  p_name    text
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

  DELETE FROM player_attributes
  WHERE game_id = p_game_id AND name = p_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  -- Unlink any member claiming this player
  DELETE FROM player_claims
  WHERE game_id = p_game_id
    AND COALESCE(admin_override_name, player_name) = p_name
    AND status IN ('pending', 'approved');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_player(uuid, text) TO authenticated;
