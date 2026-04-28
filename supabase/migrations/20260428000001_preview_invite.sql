-- preview_invite: returns minimal context about an invite token so that
-- unauthenticated visitors landing on /invite?token=... can see the league
-- name and role before signing in. SECURITY DEFINER bypasses the
-- game_invites RLS policy that requires existing membership to read.
--
-- Returns zero rows when the token is unknown, expired, or malformed.
-- target_email is null for open invites (email = '*'), populated for
-- targeted invites so the client can detect mismatch before calling
-- accept_game_invite (the RPC also enforces this server-side).
--
-- Disclosure note: target_email is intentionally returned to anon callers
-- so the client can render a "this invite was sent to X" message before
-- sign-in. Mitigation: tokens are 32-byte random hex (effectively
-- unguessable) and single-use, so this only leaks to a holder of a valid
-- targeted-invite token — i.e. someone who has already received the link.

CREATE OR REPLACE FUNCTION public.preview_invite(invite_token text)
RETURNS TABLE (
  league_name text,
  league_slug text,
  role text,
  target_email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.name, g.slug, gi.role,
         CASE WHEN gi.email = '*' THEN NULL ELSE gi.email END
  FROM game_invites gi
  JOIN games g ON g.id = gi.game_id
  WHERE gi.token = invite_token
    AND gi.expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO anon, authenticated;
