-- is_game_admin(p_game_id, p_user_id DEFAULT auth.uid()) let anyone with
-- EXECUTE (PUBLIC, anon, authenticated) ask whether *another* user admins a
-- league by passing their id. Nothing passes the second argument: every RLS
-- policy, SQL function and the app call the one-argument form.
--
-- Revoking EXECUTE is not an option: 13 RLS policies call this function and
-- run with the querying user's privileges, so anon and authenticated must
-- keep it. Dropping the two-argument signature would drop those policies too.
-- So keep the signature and grants, and always check the caller instead.
-- p_user_id is now ignored; it stays only because the policies are bound to
-- this signature.

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
      AND user_id = auth.uid()
      AND role IN ('creator', 'admin')
  );
$$;
