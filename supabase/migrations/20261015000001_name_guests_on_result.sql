-- supabase/migrations/20261015000001_name_guests_on_result.sql
--
-- Guests switched to "Add to the roster" while saving a result were only
-- inserted into player_attributes under their new name. The match kept the
-- guest name ('Alice +1'), so the game never counted towards the new player.
--
-- 1. rename_guest_in_week: internal helper that turns a guest on one week into
--    a player: renames them in the team arrays and the week's payment row, and
--    drops their line-up metadata guest entry, so the Admin tab shows that
--    game's fee under the new player rather than whoever brought them.
-- 2. name_guests: called by the result modal after record_result, with the
--    same access check (can_do_match_entry).
-- 3. admin_name_guest now uses the helper, so naming a guest from a match card
--    moves the fee and payment row to the new player too.

-- ── 1. rename_guest_in_week (internal) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rename_guest_in_week(
  p_week_id  uuid,
  p_old_name text,
  p_new_name text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE weeks
  SET team_a = CASE WHEN team_a @> to_jsonb(p_old_name) THEN (
        SELECT jsonb_agg(CASE WHEN t.val = p_old_name THEN p_new_name ELSE t.val END ORDER BY t.ord)
        FROM jsonb_array_elements_text(team_a) WITH ORDINALITY AS t(val, ord)
      ) ELSE team_a END,
      team_b = CASE WHEN team_b @> to_jsonb(p_old_name) THEN (
        SELECT jsonb_agg(CASE WHEN t.val = p_old_name THEN p_new_name ELSE t.val END ORDER BY t.ord)
        FROM jsonb_array_elements_text(team_b) WITH ORDINALITY AS t(val, ord)
      ) ELSE team_b END,
      lineup_metadata = CASE WHEN jsonb_typeof(lineup_metadata->'guests') = 'array' THEN jsonb_set(
        lineup_metadata,
        '{guests}',
        COALESCE((
          SELECT jsonb_agg(t.g ORDER BY t.ord)
          FROM jsonb_array_elements(lineup_metadata->'guests') WITH ORDINALITY AS t(g, ord)
          WHERE t.g->>'name' IS DISTINCT FROM p_old_name
        ), '[]'::jsonb)
      ) ELSE lineup_metadata END
  WHERE id = p_week_id
    AND (team_a @> to_jsonb(p_old_name) OR team_b @> to_jsonb(p_old_name));

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE week_payments
  SET payer = p_new_name
  WHERE week_id = p_week_id AND payer = p_old_name;

  RETURN true;
END;
$$;

-- Only callable from the SECURITY DEFINER functions below.
REVOKE ALL ON FUNCTION public.rename_guest_in_week(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ── 2. name_guests (result entry) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.name_guests(
  p_week_id uuid,
  p_guests  jsonb  -- array of {old_name: text, new_name: text, rating: int, goalkeeper: bool}
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id uuid;
  v_guest   jsonb;
  v_old     text;
  v_new     text;
  v_rating  int;
BEGIN
  SELECT game_id INTO v_game_id FROM weeks WHERE id = p_week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Week not found'; END IF;

  IF NOT can_do_match_entry(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_guest IN SELECT * FROM jsonb_array_elements(p_guests) LOOP
    v_old    := v_guest->>'old_name';
    v_new    := trim(v_guest->>'new_name');
    v_rating := (v_guest->>'rating')::int;

    IF v_new IS NULL OR length(v_new) = 0 THEN
      RAISE EXCEPTION 'invalid_new_name';
    END IF;
    IF v_rating IS NULL OR v_rating NOT IN (1, 2, 3) THEN
      RAISE EXCEPTION 'invalid_rating';
    END IF;

    IF EXISTS (
      SELECT 1 FROM weeks
      WHERE id = p_week_id AND (team_a @> to_jsonb(v_old) OR team_b @> to_jsonb(v_old))
    ) THEN
      IF EXISTS (
        SELECT 1 FROM player_attributes
        WHERE game_id = v_game_id AND name = v_new
      ) OR EXISTS (
        SELECT 1 FROM player_claims
        WHERE game_id = v_game_id
          AND (player_name = v_new OR admin_override_name = v_new)
          AND status IN ('pending', 'approved')
      ) THEN
        RAISE EXCEPTION 'name_already_exists';
      END IF;

      PERFORM rename_guest_in_week(p_week_id, v_old, v_new);

      -- record_result added the guest name to the roster; drop it unless another week still uses it
      IF NOT EXISTS (
        SELECT 1 FROM weeks
        WHERE game_id = v_game_id
          AND (team_a @> to_jsonb(v_old) OR team_b @> to_jsonb(v_old))
      ) THEN
        DELETE FROM player_attributes WHERE game_id = v_game_id AND name = v_old;
      END IF;
    ELSIF NOT EXISTS (
      -- Not renamed by an earlier attempt at saving this result either
      SELECT 1 FROM weeks
      WHERE id = p_week_id AND (team_a @> to_jsonb(v_new) OR team_b @> to_jsonb(v_new))
    ) THEN
      RAISE EXCEPTION 'guest_not_found';
    END IF;

    INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
    VALUES (v_game_id, v_new, v_rating, 'balanced', COALESCE((v_guest->>'goalkeeper')::boolean, false))
    ON CONFLICT (game_id, name) DO UPDATE
      SET rating     = EXCLUDED.rating,
          goalkeeper = EXCLUDED.goalkeeper;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.name_guests(uuid, jsonb) TO authenticated;

-- ── 3. admin_name_guest (match card "+ Add") ──────────────────────────────────
-- Unchanged apart from renaming through rename_guest_in_week.

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

  -- The week must belong to this league
  IF NOT EXISTS (SELECT 1 FROM weeks WHERE id = p_week_id AND game_id = p_game_id) THEN
    RAISE EXCEPTION 'guest_not_found';
  END IF;

  IF NOT rename_guest_in_week(p_week_id, p_old_name, p_new_name) THEN
    RAISE EXCEPTION 'guest_not_found';
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
