-- ============================================================
-- Seed any missing league_features rows for existing leagues.
--
-- The public results page queries league_features directly
-- (WHERE public_enabled = true). If no row exists for a feature,
-- it never appears publicly regardless of what the admin toggles.
-- The admin panel GET merges defaults so the UI hides this gap.
--
-- This migration is additive — ON CONFLICT DO NOTHING means
-- existing rows (and any public_enabled = true rows already set
-- by an admin) are never overwritten.
-- ============================================================

INSERT INTO league_features (game_id, feature, enabled, config, public_enabled, public_config)
SELECT
  g.id,
  f.feature,
  f.default_enabled,
  f.default_config,
  false,
  null
FROM games g
CROSS JOIN (VALUES
  ('match_history',     true,  null::jsonb),
  ('match_entry',       true,  null::jsonb),
  ('team_builder',      true,  null::jsonb),
  ('player_stats',      true,  '{"max_players":null,"visible_stats":["played","won","drew","lost","winRate","recentForm"],"show_mentality":true}'::jsonb),
  ('player_comparison', false, null::jsonb)
) AS f(feature, default_enabled, default_config)
ON CONFLICT (game_id, feature) DO NOTHING;


-- ============================================================
-- Update create_game so new leagues get all five feature rows,
-- including match_history, with public_enabled set explicitly.
-- ============================================================

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
