-- ============================================================
-- Tighten game_members INSERT policy.
--
-- The original "Admins add members" policy used is_game_member()
-- which was safe when all members were admins. Now that the
-- 'member' role exists, any member-role user could INSERT a new
-- game_members row with role='admin' via the PostgREST API.
--
-- Replace with is_game_admin() so only admins can add members.
-- SECURITY DEFINER RPCs (accept_game_invite, join_public_league)
-- bypass RLS entirely and are unaffected by this change.
-- ============================================================

DROP POLICY IF EXISTS "Admins add members" ON game_members;

CREATE POLICY "Admins add members" ON game_members
  FOR INSERT TO authenticated
  WITH CHECK (is_game_admin(game_id));


-- ============================================================
-- Tighten game_invites INSERT policy for the same reason.
-- Any member could insert invite rows directly via PostgREST.
-- ============================================================

DROP POLICY IF EXISTS "Members create invites" ON game_invites;

CREATE POLICY "Admins create invites" ON game_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid() AND is_game_admin(game_id)
  );
