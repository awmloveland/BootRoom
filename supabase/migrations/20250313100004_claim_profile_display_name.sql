-- claim_profile: use user_metadata.display_name or name from signUp
CREATE OR REPLACE FUNCTION public.claim_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  disp_name text;
BEGIN
  meta := auth.jwt()->'user_metadata';
  disp_name := COALESCE(
    meta->>'display_name',
    meta->>'name',
    auth.jwt()->>'name',
    split_part(auth.email(), '@', 1)
  );

  INSERT INTO profiles (id, email, display_name)
  SELECT auth.uid(), auth.email(), disp_name
  WHERE auth.uid() IS NOT NULL
    AND auth.email() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid())
  ON CONFLICT (id) DO NOTHING;
END;
$$;
