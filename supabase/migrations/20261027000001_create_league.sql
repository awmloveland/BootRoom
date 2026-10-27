-- supabase/migrations/20261027000001_create_league.sql
--
-- League creation from /new. The old create_game(text) failed because
-- games.slug is NOT NULL and nothing called it. The new one takes every
-- field the wizard collects, adds the creator as a member and, because the
-- creator is always a player, as a roster row with an approved claim.
-- Nothing seeds league_features: no feature is flagged (DEFAULT_FEATURES is
-- empty).

DROP FUNCTION IF EXISTS public.create_game(text);

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

  -- The player name the roster and claim use: "First Last" from the profile,
  -- falling back to the display name, then the email's local part.
  SELECT coalesce(
           nullif(trim(concat_ws(' ', first_name, last_name)), ''),
           nullif(trim(display_name), ''),
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

-- claim_profile only wrote display_name, so the roster pre-fill had nothing
-- to read for users who signed up through the OTP form (which sends
-- first_name and last_name in the metadata). Copy them on insert.
CREATE OR REPLACE FUNCTION public.claim_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  disp_name text;
BEGIN
  meta := auth.jwt()->'user_metadata';
  disp_name := COALESCE(
    meta->>'display_name',
    meta->>'name',
    auth.jwt()->>'name',
    split_part(auth.email(), '@', 1)
  );

  INSERT INTO profiles (id, email, display_name, first_name, last_name)
  SELECT auth.uid(), auth.email(), disp_name,
         nullif(trim(meta->>'first_name'), ''),
         nullif(trim(meta->>'last_name'), '')
  WHERE auth.uid() IS NOT NULL
    AND auth.email() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid())
  ON CONFLICT (id) DO NOTHING;
END;
$$;
