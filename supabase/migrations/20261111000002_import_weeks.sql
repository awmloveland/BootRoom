-- supabase/migrations/20261111000002_import_weeks.sql
--
-- Past results entered during league setup, written in one call. Validates
-- each game, inserts played weeks, adds roster rows for new names, then
-- renumbers every week of the league by date within its season.
-- p_weeks: [{ date: 'DD Mon YYYY', team_a: [..], team_b: [..],
--             winner: 'teamA'|'teamB'|'draw', goal_difference: int }]

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
  IF jsonb_typeof(p_weeks) <> 'array' OR jsonb_array_length(p_weeks) = 0 THEN
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

    a := coalesce(jsonb_array_length(w->'team_a'), 0);
    b := coalesce(jsonb_array_length(w->'team_b'), 0);
    IF a = 0 OR b = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(w->'team_a') x
      JOIN jsonb_array_elements_text(w->'team_b') y ON x = y
    ) THEN
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

GRANT EXECUTE ON FUNCTION public.import_weeks(uuid, jsonb) TO authenticated;
