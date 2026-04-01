-- supabase/migrations/20260401000003_harden_join_requests.sql
--
-- Phase 3 hardening for game_join_requests:
--
-- 1. Updates submit_join_request to upsert: declined rows are reset to pending
--    instead of blocking the re-request. Pending duplicates still raise an error
--    (caught by the API route as 409). Already-member is also blocked here.
-- 2. Adds a composite index on (game_id, status) for the hot query path used by
--    get_join_requests and getPendingJoinCount.
-- 3. Adds a focused RLS SELECT policy so users can read their own rows via direct
--    table access (RPCs use SECURITY DEFINER and bypass RLS).
--

-- ── submit_join_request (upsert version) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_join_request(
  p_game_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_email        TEXT;
  v_display_name TEXT;
  v_existing     game_join_requests%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Block if already a league member
  IF EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Already a member';
  END IF;

  -- Check for any existing request row for this user+league
  SELECT * INTO v_existing
  FROM game_join_requests
  WHERE game_id = p_game_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      -- Duplicate pending: caller must wait for admin review
      RAISE EXCEPTION 'Request already pending';
    ELSIF v_existing.status = 'approved' THEN
      -- Approved row means they should already be a member (guard above catches this,
      -- but handle the race condition gracefully)
      RAISE EXCEPTION 'Already a member';
    ELSIF v_existing.status = 'declined' THEN
      -- Re-request after decline: reset to pending with the new message
      UPDATE game_join_requests
      SET status     = 'pending',
          message    = p_message,
          updated_at = now()
      WHERE id = v_existing.id;
      RETURN;
    END IF;
  END IF;

  -- No existing request — look up profile details and insert fresh row
  SELECT email, display_name INTO v_email, v_display_name
  FROM profiles
  WHERE id = v_user_id;

  INSERT INTO game_join_requests (game_id, user_id, email, display_name, message)
  VALUES (p_game_id, v_user_id, v_email, COALESCE(v_display_name, v_email), p_message);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(UUID, TEXT) TO authenticated;

-- ── Performance index ──────────────────────────────────────────────────────────
-- Speeds up get_join_requests (WHERE game_id = ? AND status = 'pending') and
-- getPendingJoinCount, both of which filter on (game_id, status).
CREATE INDEX IF NOT EXISTS idx_game_join_requests_game_status
  ON public.game_join_requests (game_id, status);

-- ── RLS policy: own-row read access ───────────────────────────────────────────
-- RLS is already enabled on this table (Phase 1). Phase 1 added a permissive
-- SELECT policy that allows user_id = auth.uid() OR is_game_admin(game_id).
-- Admins also access rows exclusively via the SECURITY DEFINER RPCs which bypass
-- RLS. Direct SELECT access for regular users is intentionally limited to their
-- own rows here for belt-and-suspenders defence-in-depth.
ALTER TABLE public.game_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own join requests"
  ON public.game_join_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
