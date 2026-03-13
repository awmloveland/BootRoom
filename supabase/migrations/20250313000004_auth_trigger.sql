-- RPC: claim profile (call after sign-in if profile doesn't exist)
-- Creates profile when user's email is in league_invites
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
    AND EXISTS (SELECT 1 FROM league_invites WHERE league_invites.email = lower(auth.email()))
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid())
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_profile() TO authenticated;
