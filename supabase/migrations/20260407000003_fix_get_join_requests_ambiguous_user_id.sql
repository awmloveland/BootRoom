-- supabase/migrations/20260407000003_fix_get_join_requests_ambiguous_user_id.sql
--
-- get_join_requests declares RETURNS TABLE (..., user_id uuid, ...), which
-- creates a PL/pgSQL output variable named "user_id". The admin check inside
-- the function referenced game_members.user_id without a table qualifier,
-- causing PostgreSQL to raise "column reference user_id is ambiguous" on
-- every call. This prevented admins from seeing pending join requests — the
-- API returned 500 and the UI silently fell back to "No pending requests."
--
-- Fix: add a table alias (gm) to game_members and qualify all column
-- references in the IF NOT EXISTS subquery.
--
CREATE OR REPLACE FUNCTION public.get_join_requests(p_game_id uuid)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  email        text,
  display_name text,
  message      text,
  status       text,
  created_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin or creator (fully-qualified to avoid ambiguity
  -- with the "user_id" output column declared in RETURNS TABLE above)
  IF NOT EXISTS (
    SELECT 1 FROM game_members gm
    WHERE gm.game_id = p_game_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    gjr.id,
    gjr.user_id,
    gjr.email,
    gjr.display_name,
    gjr.message,
    gjr.status,
    gjr.created_at
  FROM game_join_requests gjr
  WHERE gjr.game_id = p_game_id
    AND gjr.status = 'pending'
  ORDER BY gjr.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_join_requests(uuid) TO authenticated;
