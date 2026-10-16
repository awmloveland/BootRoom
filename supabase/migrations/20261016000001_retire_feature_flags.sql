-- Retire every feature flag. Results, players, quarter champions and line-up
-- share images are now always on, and only league admins enter results.
-- The league_features table and the app's flag helpers stay for future flags.

-- 1. Match entry is admin only. Previously members could save line-ups,
--    record results and cancel weeks when match_entry was enabled for them.
--    save_lineup, record_result, cancel_week, cancel_lineup and friends all
--    call this helper, so they follow.
CREATE OR REPLACE FUNCTION can_do_match_entry(p_game_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN is_game_admin(p_game_id);
END;
$$;

-- 2. New leagues no longer get seeded flag rows.
CREATE OR REPLACE FUNCTION public.create_game(game_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_uuid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(game_name) = '' THEN
    RAISE EXCEPTION 'Game name is required';
  END IF;

  INSERT INTO games (name, created_by)
  VALUES (trim(game_name), auth.uid())
  RETURNING id INTO game_uuid;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (game_uuid, auth.uid(), 'creator');

  RETURN game_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text) TO authenticated;

-- 3. Remove the retired flags' rows, including all_time_records and
--    share_teams, which were added by hand and never used by the app.
DELETE FROM league_features
WHERE feature IN (
  'match_history',
  'match_entry',
  'player_stats',
  'player_comparison',
  'quarter_celebration',
  'lineup_share_image',
  'team_builder',
  'all_time_records',
  'share_teams'
);

-- 4. Drop the global availability layer (the developer-only /experiments page).
DROP TABLE IF EXISTS feature_experiments;
