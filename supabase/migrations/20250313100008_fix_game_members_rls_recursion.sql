-- Fix infinite recursion: game_members RLS policies reference game_members,
-- causing recursion when config/weeks/games policies check membership.
-- Use a SECURITY DEFINER helper that bypasses RLS.

CREATE OR REPLACE FUNCTION public.is_game_member(p_game_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_game_member(uuid, uuid) TO authenticated;

-- Drop and recreate policies that referenced game_members (causing recursion)

DROP POLICY IF EXISTS "Members read games" ON games;
CREATE POLICY "Members read games" ON games
  FOR SELECT TO authenticated
  USING (is_game_member(id));

DROP POLICY IF EXISTS "Members read game_members" ON game_members;
CREATE POLICY "Members read game_members" ON game_members
  FOR SELECT TO authenticated
  USING (is_game_member(game_id));

DROP POLICY IF EXISTS "Admins add members" ON game_members;
CREATE POLICY "Admins add members" ON game_members
  FOR INSERT TO authenticated
  WITH CHECK (is_game_member(game_id));

DROP POLICY IF EXISTS "Members read game_invites" ON game_invites;
CREATE POLICY "Members read game_invites" ON game_invites
  FOR SELECT TO authenticated
  USING (is_game_member(game_id));

DROP POLICY IF EXISTS "Members create invites" ON game_invites;
CREATE POLICY "Members create invites" ON game_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid() AND is_game_member(game_id)
  );

DROP POLICY IF EXISTS "Game members read weeks" ON weeks;
CREATE POLICY "Game members read weeks" ON weeks
  FOR SELECT TO authenticated
  USING (is_game_member(game_id));

DROP POLICY IF EXISTS "Game members insert weeks" ON weeks;
CREATE POLICY "Game members insert weeks" ON weeks
  FOR INSERT TO authenticated
  WITH CHECK (is_game_member(game_id));

DROP POLICY IF EXISTS "Game members read config" ON config;
CREATE POLICY "Game members read config" ON config
  FOR SELECT TO authenticated
  USING (is_game_member(game_id));

DROP POLICY IF EXISTS "Game members insert config" ON config;
CREATE POLICY "Game members insert config" ON config
  FOR INSERT TO authenticated
  WITH CHECK (is_game_member(game_id));
