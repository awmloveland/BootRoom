-- ============================================================
-- Multi-role access system
-- ============================================================
-- 1. Extend game_members.role to include 'member'
-- 2. Add public_results_enabled to games
-- 3. league_features table + RLS
-- 4. is_game_admin() helper
-- 5. Anon RLS policies on weeks + games
-- 6. join_public_league RPC
-- 7. get_league_members RPC
-- 8. update_member_role RPC
-- 9. remove_member RPC
-- 10. Update create_game RPC to seed default feature flags
-- ============================================================


-- ------------------------------------------------------------
-- 1. Extend game_members.role
-- ------------------------------------------------------------
ALTER TABLE game_members DROP CONSTRAINT IF EXISTS game_members_role_check;
ALTER TABLE game_members ADD CONSTRAINT game_members_role_check
  CHECK (role IN ('creator', 'admin', 'member'));


-- ------------------------------------------------------------
-- 2. Add public_results_enabled to games
-- ------------------------------------------------------------
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS public_results_enabled boolean NOT NULL DEFAULT false;


-- ------------------------------------------------------------
-- 3. league_features table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS league_features (
  game_id    uuid        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  feature    text        NOT NULL,
  enabled    boolean     NOT NULL DEFAULT true,
  config     jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, feature)
);

ALTER TABLE league_features ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 4. is_game_admin() helper (SECURITY DEFINER — bypasses RLS)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_game_admin(
  p_game_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id
      AND user_id = p_user_id
      AND role IN ('creator', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_game_admin(uuid, uuid) TO authenticated;


-- ------------------------------------------------------------
-- 5. RLS on league_features
--    Admins: full read/write. Members: read only.
-- ------------------------------------------------------------
CREATE POLICY "Admins manage league_features" ON league_features
  FOR ALL TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (is_game_admin(game_id));

CREATE POLICY "Members read league_features" ON league_features
  FOR SELECT TO authenticated
  USING (is_game_member(game_id));


-- ------------------------------------------------------------
-- 6a. Allow admins to update games (e.g. toggle public_results_enabled)
-- ------------------------------------------------------------
CREATE POLICY "Admins update games" ON games
  FOR UPDATE TO authenticated
  USING (is_game_admin(id))
  WITH CHECK (is_game_admin(id));


-- ------------------------------------------------------------
-- 6b. Anon RLS: allow public read of games + weeks for leagues
--    where public_results_enabled = true
-- ------------------------------------------------------------
CREATE POLICY "Public read games" ON games
  FOR SELECT TO anon
  USING (public_results_enabled = true);

CREATE POLICY "Public read weeks" ON weeks
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM games
      WHERE games.id = weeks.game_id
        AND games.public_results_enabled = true
    )
  );


-- ------------------------------------------------------------
-- 7. join_public_league RPC
--    Authenticated users can join a public-results league as member.
--    ON CONFLICT DO NOTHING so existing admins keep their role.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_public_league(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM games WHERE id = p_game_id AND public_results_enabled = true
  ) THEN
    RAISE EXCEPTION 'League is not publicly accessible';
  END IF;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (p_game_id, auth.uid(), 'member')
  ON CONFLICT (game_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_public_league(uuid) TO authenticated;


-- ------------------------------------------------------------
-- 8. get_league_members RPC
--    Admin-only: returns all members with email + display_name.
--    SECURITY DEFINER so it can join profiles (users only see own row).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_league_members(p_game_id uuid)
RETURNS TABLE (
  user_id      uuid,
  email        text,
  display_name text,
  role         text,
  joined_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    gm.user_id,
    p.email,
    p.display_name,
    gm.role,
    gm.joined_at
  FROM game_members gm
  JOIN profiles p ON p.id = gm.user_id
  WHERE gm.game_id = p_game_id
    AND is_game_admin(p_game_id)
  ORDER BY
    CASE gm.role WHEN 'creator' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    gm.joined_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_members(uuid) TO authenticated;


-- ------------------------------------------------------------
-- 9. update_member_role RPC
--    Admin can promote/demote between admin <-> member.
--    Creator role is immutable.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_member_role(
  p_game_id uuid,
  p_user_id uuid,
  p_role    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Not an admin of this league';
  END IF;

  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Role must be admin or member';
  END IF;

  IF EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = p_user_id AND role = 'creator'
  ) THEN
    RAISE EXCEPTION 'Cannot change the creator''s role';
  END IF;

  UPDATE game_members
  SET role = p_role
  WHERE game_id = p_game_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_role(uuid, uuid, text) TO authenticated;


-- ------------------------------------------------------------
-- 10. remove_member RPC
--     Admin can remove any non-creator member.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_member(
  p_game_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Not an admin of this league';
  END IF;

  IF EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = p_user_id AND role = 'creator'
  ) THEN
    RAISE EXCEPTION 'Cannot remove the creator';
  END IF;

  DELETE FROM game_members
  WHERE game_id = p_game_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;


-- ------------------------------------------------------------
-- 11. Update create_game RPC to seed default league_features
-- ------------------------------------------------------------
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

  -- Seed default feature flags for the new league
  INSERT INTO league_features (game_id, feature, enabled, config) VALUES
    (game_uuid, 'match_entry',       true,  NULL),
    (game_uuid, 'player_stats',      true,  '{"max_players": null, "visible_stats": ["played","won","drew","lost","winRate","recentForm"]}'::jsonb),
    (game_uuid, 'player_comparison', false, NULL);

  RETURN game_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game(text) TO authenticated;
