-- Open signup: create profile for any user (remove league_invites requirement)
CREATE OR REPLACE FUNCTION public.claim_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  SELECT auth.uid(), auth.email(), COALESCE(auth.jwt()->>'name', split_part(auth.email(), '@', 1))
  WHERE auth.uid() IS NOT NULL
    AND auth.email() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid())
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- RPC: accept game invite (user must be authenticated, token valid, email matches)
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

  IF lower(auth.email()) != lower(inv.email) THEN
    RAISE EXCEPTION 'Invite was sent to a different email';
  END IF;

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (inv.game_id, auth.uid(), 'admin')
  ON CONFLICT (game_id, user_id) DO NOTHING;

  DELETE FROM game_invites WHERE id = inv.id;

  RETURN inv.game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_game_invite(text) TO authenticated;
