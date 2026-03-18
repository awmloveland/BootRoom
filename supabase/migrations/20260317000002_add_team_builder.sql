-- Re-seed team_builder feature on all existing leagues (idempotent)
INSERT INTO league_features (game_id, feature, enabled, config, public_enabled, public_config)
SELECT g.id, 'team_builder', true, null, false, null
FROM games g
ON CONFLICT (game_id, feature) DO NOTHING;

-- Update create_game() to include team_builder again
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

  -- Seed all feature flags. All start with public_enabled = false.
  -- Admins promote individual features via Settings → Features.
  INSERT INTO league_features (game_id, feature, enabled, config, public_enabled, public_config) VALUES
    (game_uuid, 'match_history',     true,  NULL,                                                                                                              false, NULL),
    (game_uuid, 'match_entry',       true,  NULL,                                                                                                              false, NULL),
    (game_uuid, 'team_builder',      true,  NULL,                                                                                                              false, NULL),
    (game_uuid, 'player_stats',      true,  '{"max_players":null,"visible_stats":["played","won","drew","lost","winRate","recentForm"],"show_mentality":true}'::jsonb, false, NULL),
    (game_uuid, 'player_comparison', false, NULL,                                                                                                              false, NULL);

  RETURN game_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text) TO authenticated;
