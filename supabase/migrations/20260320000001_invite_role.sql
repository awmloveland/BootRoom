-- 1. Add role column (defaults to 'admin' — existing rows are unaffected)
ALTER TABLE game_invites
  ADD COLUMN role text NOT NULL DEFAULT 'admin'
  CHECK (role IN ('admin', 'member'));

-- 2. Drop old unique constraint
ALTER TABLE game_invites
  DROP CONSTRAINT IF EXISTS game_invites_game_id_email_key;

-- 3. Add new constraint including role
ALTER TABLE game_invites
  ADD CONSTRAINT game_invites_game_id_email_role_key UNIQUE (game_id, email, role);

-- 4. Update accept_game_invite RPC to use inv.role instead of hardcoded 'admin'
--    Open invites (email='*') skip email check.
--    Bootstrap invites (invited_by IS NULL) also skip email check.
--    Open invite rows are deleted on accept (single-use).
CREATE OR REPLACE FUNCTION public.accept_game_invite(invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv game_invites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO inv FROM game_invites
  WHERE token = invite_token
    AND expires_at > now()
  LIMIT 1;

  IF inv IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  -- Open invites (email='*') or bootstrap invites (invited_by IS NULL): skip email check
  IF inv.email != '*' AND inv.invited_by IS NOT NULL AND lower(auth.email()) != lower(inv.email) THEN
    RAISE EXCEPTION 'Invite was sent to a different email';
  END IF;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (inv.game_id, auth.uid(), inv.role)
  ON CONFLICT (game_id, user_id) DO NOTHING;

  -- Delete on accept — open-invite tokens are single-use
  DELETE FROM game_invites WHERE id = inv.id;

  RETURN inv.game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_game_invite(text) TO authenticated;
