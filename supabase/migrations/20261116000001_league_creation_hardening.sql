-- supabase/migrations/20261116000001_league_creation_hardening.sql
--
-- League creation is open to anyone with an account, and every rule so far
-- lived in the API routes. A caller with their own session can reach the
-- database directly, so the rules that matter move here:
--
--   1. games: the address, name, venue, bio, day and kick-off are checked by
--      the table, whoever writes them.
--   2. Leagues are created through create_game only; the direct INSERT policy
--      goes. Nothing in the app used it.
--   3. create_game: at most five leagues per account in 24 hours, and the
--      creator's player name stops at 50 characters.
--   4. import_weeks: at most 200 games, 30 a side, names trimmed and at most
--      50 characters, nobody twice in one game (on one side or both).
--   5. create_game, import_weeks and claim_profile are no longer callable
--      signed out. Their own checks already refused; this refuses earlier.
--
-- Run after 20261111000002_import_weeks.sql. Safe to run twice.
-- Checked against production on 2026-11-16: both existing leagues satisfy
-- every constraint in part 1.

-- ── 1. games: constraints ────────────────────────────────────────────────────
-- The reserved words are the app's own top-level routes. A league created
-- through the API always ends in a three-character code and cannot collide;
-- this covers a slug written any other way.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_slug_format;
ALTER TABLE games ADD CONSTRAINT games_slug_format CHECK (
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND char_length(slug) <= 100
  AND slug NOT IN ('api', 'app', 'auth', 'invite', 'new', 'profile-required', 'results', 'settings', 'sign-in')
);

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_name_length;
ALTER TABLE games ADD CONSTRAINT games_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80);

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_location_length;
ALTER TABLE games ADD CONSTRAINT games_location_length CHECK (location IS NULL OR char_length(location) <= 120);

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_bio_length;
ALTER TABLE games ADD CONSTRAINT games_bio_length CHECK (bio IS NULL OR char_length(bio) <= 500);

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_day_valid;
ALTER TABLE games ADD CONSTRAINT games_day_valid CHECK (
  day IS NULL OR day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
);

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_kickoff_time_format;
ALTER TABLE games ADD CONSTRAINT games_kickoff_time_format CHECK (
  kickoff_time IS NULL OR kickoff_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);

-- ── 2. Leagues are created through create_game only ──────────────────────────
-- create_game is SECURITY DEFINER and does not need this policy. With it in
-- place a signed-in caller could insert a games row directly and skip the
-- limit below.
DROP POLICY IF EXISTS "Authenticated create games" ON games;

-- ── 3. create_game: five leagues per account per day ─────────────────────────
-- Same function as 20261111000001 with the limit and the name cap added.
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

  -- League pages are public and sign-up is open: one account cannot fill the
  -- site. POST /api/games answers this with a 429.
  IF (SELECT count(*) FROM games
       WHERE created_by = auth.uid()
         AND created_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'too_many_leagues';
  END IF;

  -- The player name the roster and claim use: first name plus the surname's
  -- initial ("Will L"), falling back to the display name's first word, then
  -- the email's local part. A null first name makes the whole concat null.
  -- Capped at the roster's 50 characters: the profile's names come from the
  -- sign-up form and are not otherwise limited.
  SELECT left(coalesce(
           nullif(trim(first_name), '') || coalesce(' ' || nullif(left(trim(last_name), 1), ''), ''),
           nullif(split_part(trim(display_name), ' ', 1), ''),
           split_part(email, '@', 1)
         ), 50)
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

-- ── 4. import_weeks: tighter limits on what one call can write ───────────────
-- Same function as 20261111000002 with the batch limit and the stricter
-- invalid_teams check.
CREATE OR REPLACE FUNCTION public.import_weeks(p_game_id uuid, p_weeks jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w        jsonb;
  d        date;
  a        int;
  b        int;
  winner   text;
  margin   int;
  inserted int := 0;
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  -- Two steps: jsonb_array_length raises on anything that is not an array.
  IF jsonb_typeof(p_weeks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_weeks';
  END IF;
  IF jsonb_array_length(p_weeks) = 0 OR jsonb_array_length(p_weeks) > 200 THEN
    RAISE EXCEPTION 'invalid_weeks';
  END IF;

  FOR w IN SELECT * FROM jsonb_array_elements(p_weeks) LOOP
    BEGIN
      d := to_date(w->>'date', 'DD Mon YYYY');
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_date';
    END;
    IF d IS NULL OR d > (now() AT TIME ZONE 'Europe/London')::date OR to_char(d, 'DD Mon YYYY') <> (w->>'date') THEN
      RAISE EXCEPTION 'invalid_date';
    END IF;

    IF jsonb_typeof(w->'team_a') IS DISTINCT FROM 'array'
       OR jsonb_typeof(w->'team_b') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid_teams';
    END IF;
    a := jsonb_array_length(w->'team_a');
    b := jsonb_array_length(w->'team_b');
    -- 1 to 30 a side; every name trimmed, non-blank and at most 50 characters;
    -- nobody twice in one game, on one side or both.
    IF a = 0 OR b = 0 OR a > 30 OR b > 30
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text((w->'team_a') || (w->'team_b')) AS n
         WHERE n IS NULL OR btrim(n) = '' OR n <> btrim(n) OR char_length(n) > 50
       )
       OR (SELECT count(DISTINCT n) FROM jsonb_array_elements_text((w->'team_a') || (w->'team_b')) AS n) <> a + b
    THEN
      RAISE EXCEPTION 'invalid_teams';
    END IF;

    winner := w->>'winner';
    IF winner IS NULL OR winner NOT IN ('teamA', 'teamB', 'draw') THEN
      RAISE EXCEPTION 'invalid_winner';
    END IF;
    margin := (w->>'goal_difference')::int;
    IF margin IS NULL
       OR (winner = 'draw' AND margin <> 0)
       OR (winner <> 'draw' AND (margin < 1 OR margin > 20)) THEN
      RAISE EXCEPTION 'invalid_margin';
    END IF;

    IF EXISTS (SELECT 1 FROM weeks WHERE game_id = p_game_id AND date = (w->>'date')) THEN
      RAISE EXCEPTION 'already_exists';
    END IF;

    INSERT INTO weeks (game_id, season, week, date, status, format, team_a, team_b, winner, goal_difference)
    VALUES (
      p_game_id,
      to_char(d, 'YYYY'),
      -- Placeholder; renumbered below. Above the 100000 offset the renumber
      -- pass adds to existing rows, so neither can collide with the other.
      200000 + inserted,
      w->>'date',
      'played',
      CASE WHEN a = b THEN a || '-a-side' ELSE greatest(a, b) || 'v' || least(a, b) END,
      w->'team_a',
      w->'team_b',
      winner,
      margin
    );
    inserted := inserted + 1;

    INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
    SELECT DISTINCT p_game_id, n, 2, 'balanced', false
    FROM (
      SELECT jsonb_array_elements_text(w->'team_a') AS n
      UNION
      SELECT jsonb_array_elements_text(w->'team_b')
    ) names
    ON CONFLICT (game_id, name) DO NOTHING;
  END LOOP;

  -- Renumber 1..n per season by date, scheduled and unrecorded rows included.
  -- Two passes so (game_id, season, week) stays unique while rows move; dates
  -- are unique per league after the check above, so created_at is only a tiebreak.
  UPDATE weeks SET week = week + 100000 WHERE game_id = p_game_id AND week < 100000;
  UPDATE weeks x
     SET week = r.rn
    FROM (
      SELECT id, row_number() OVER (PARTITION BY season ORDER BY to_date(date, 'DD Mon YYYY'), created_at) AS rn
      FROM weeks WHERE game_id = p_game_id
    ) r
   WHERE x.id = r.id;

  RETURN inserted;
END;
$$;

-- ── 5. No anonymous EXECUTE ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_game(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_game(text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.import_weeks(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_weeks(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_profile() TO authenticated;
