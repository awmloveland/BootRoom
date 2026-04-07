-- supabase/migrations/20260401000002_add_join_request_review_rpcs.sql
--
-- Adds review_join_request and get_join_requests RPCs for Phase 2 of the
-- league join flow. Admins can approve or decline pending requests via the
-- Settings → Members tab.
--

-- ── review_join_request ───────────────────────────────────────────────────────
-- Called by an admin/creator to approve or decline a pending join request.
-- If approved, inserts a row into game_members (idempotent — no-op if already
-- a member). Sets reviewed_by to the calling user's ID.
CREATE OR REPLACE FUNCTION public.review_join_request(
  p_request_id uuid,
  p_action     text  -- 'approved' or 'declined'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request  game_join_requests%ROWTYPE;
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Fetch the request row
  SELECT * INTO v_request FROM game_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- Verify caller is admin or creator of this league
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = v_request.game_id
      AND user_id = v_admin_id
      AND role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Update the request status
  UPDATE game_join_requests
  SET status      = p_action,
      reviewed_by = v_admin_id,
      updated_at  = now()
  WHERE id = p_request_id;

  -- If approved, insert into game_members (idempotent)
  IF p_action = 'approved' THEN
    INSERT INTO game_members (game_id, user_id, role)
    VALUES (v_request.game_id, v_request.user_id, 'member')
    ON CONFLICT (game_id, user_id) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_join_request(uuid, text) TO authenticated;

-- ── get_join_requests ─────────────────────────────────────────────────────────
-- Returns all pending join requests for a league. Admin/creator only.
-- Called by the Settings → Members tab to populate the Pending Requests section.
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
  -- Verify caller is admin or creator
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id
      AND user_id = auth.uid()
      AND role IN ('creator', 'admin')
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
