-- supabase/migrations/20260512000001_admin_name_guest.sql
--
-- admin_name_guest: convert a guest entry on a single week into a named player.
-- Scoped to one week: only rewrites the specified weeks row, not the league as a whole.
-- Inserts a new player_attributes row for the new name with the given mentality + rating.
-- Deletes the old player_attributes row only if no other week in the league still references it.
-- Raises 'name_already_exists' if p_new_name already exists in player_attributes or active claims.
-- Raises 'guest_not_found' if the old name is not on the specified week.
--

CREATE OR REPLACE FUNCTION public.admin_name_guest(
  p_game_id    uuid,
  p_week_id    uuid,
  p_old_name   text,
  p_new_name   text,
  p_mentality  text,
  p_rating     int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_in_team_a boolean;
  v_in_team_b boolean;
  v_old_still_used boolean;
BEGIN
  -- Admin gate
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate inputs
  IF p_new_name IS NULL OR length(trim(p_new_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_new_name';
  END IF;
  IF p_mentality NOT IN ('balanced', 'attacking', 'defensive', 'goalkeeper') THEN
    RAISE EXCEPTION 'invalid_mentality';
  END IF;
  IF p_rating NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  -- Conflict check: new name must not already exist in player_attributes or active claims
  IF EXISTS (
    SELECT 1 FROM player_attributes
    WHERE game_id = p_game_id AND name = p_new_name
  ) OR EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id
      AND (player_name = p_new_name OR admin_override_name = p_new_name)
      AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'name_already_exists';
  END IF;

  -- Locate the guest in the specified week
  SELECT
    team_a @> to_jsonb(p_old_name),
    team_b @> to_jsonb(p_old_name)
  INTO v_in_team_a, v_in_team_b
  FROM weeks
  WHERE id = p_week_id AND game_id = p_game_id;

  IF NOT FOUND OR (v_in_team_a IS NOT TRUE AND v_in_team_b IS NOT TRUE) THEN
    RAISE EXCEPTION 'guest_not_found';
  END IF;

  -- Rewrite the targeted week's team JSONB (only the side that contains the guest)
  IF v_in_team_a THEN
    UPDATE weeks
    SET team_a = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_a) AS val
    )
    WHERE id = p_week_id;
  END IF;

  IF v_in_team_b THEN
    UPDATE weeks
    SET team_b = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_b) AS val
    )
    WHERE id = p_week_id;
  END IF;

  -- Insert the new player_attributes row
  INSERT INTO player_attributes (game_id, name, mentality, rating)
  VALUES (p_game_id, p_new_name, p_mentality, p_rating);

  -- If the old name is no longer referenced by any week in this league, delete its row
  SELECT EXISTS (
    SELECT 1 FROM weeks
    WHERE game_id = p_game_id
      AND (team_a @> to_jsonb(p_old_name) OR team_b @> to_jsonb(p_old_name))
  ) INTO v_old_still_used;

  IF NOT v_old_still_used THEN
    DELETE FROM player_attributes
    WHERE game_id = p_game_id AND name = p_old_name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_name_guest(uuid, uuid, text, text, text, int) TO authenticated;
