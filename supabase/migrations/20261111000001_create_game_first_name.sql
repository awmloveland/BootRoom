-- supabase/migrations/20261111000001_create_game_first_name.sql
--
-- The creator's player was named "First Last"; teammates know each other by
-- first name and every other roster entry is typed that way, so the creator's
-- row and claim now use the first name alone. Same function otherwise.

CREATE OR REPLACE FUNCTION public.create_game(
  p_name text,
  p_slug text,
  p_location text,
  p_day text,
  p_kickoff_time text,
  p_bio text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id uuid;
  v_player text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF trim(coalesce(p_slug, '')) = '' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  -- The player name the roster and claim use: the first name, as teammates
  -- say it, falling back to the display name's first word, then the email's
  -- local part.
  SELECT coalesce(
           nullif(trim(first_name), ''),
           nullif(split_part(trim(display_name), ' ', 1), ''),
           split_part(email, '@', 1)
         )
    INTO v_player
    FROM profiles
   WHERE id = auth.uid();
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  INSERT INTO games (name, slug, location, day, kickoff_time, bio, created_by)
  VALUES (
    trim(p_name),
    trim(p_slug),
    nullif(trim(coalesce(p_location, '')), ''),
    p_day,
    p_kickoff_time,
    nullif(trim(coalesce(p_bio, '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_game_id;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (v_game_id, auth.uid(), 'creator');

  INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
  VALUES (v_game_id, v_player, 2, 'balanced', false);

  INSERT INTO player_claims (game_id, user_id, player_name, status, reviewed_by)
  VALUES (v_game_id, auth.uid(), v_player, 'approved', auth.uid());

  RETURN v_game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text, text, text, text, text, text) TO authenticated;
