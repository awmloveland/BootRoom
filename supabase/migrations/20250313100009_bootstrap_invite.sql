-- Bootstrap invite: allow first admin to claim the legacy game via a link.
-- invited_by NULL = bootstrap invite (anyone who opens the link can accept).

ALTER TABLE game_invites
  ALTER COLUMN invited_by DROP NOT NULL;

-- accept_game_invite: skip email check for bootstrap invites (invited_by IS NULL)
CREATE OR REPLACE FUNCTION public.accept_game_invite(invite_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv game_invites;
  game_uuid uuid;
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

  -- Open invites (email='*') or bootstrap (invited_by IS NULL): accept any email
  IF inv.email != '*' AND inv.invited_by IS NOT NULL AND lower(auth.email()) != lower(inv.email) THEN
    RAISE EXCEPTION 'Invite was sent to a different email';
  END IF;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (inv.game_id, auth.uid(), 'admin')
  ON CONFLICT (game_id, user_id) DO NOTHING;

  DELETE FROM game_invites WHERE id = inv.id;

  RETURN inv.game_id;
END;
$$;
