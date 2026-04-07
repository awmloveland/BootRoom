-- supabase/migrations/20260407000002_harden_submit_join_request.sql
--
-- Adds an explicit profile existence check to submit_join_request.
-- Previously, if claim_profile ran without an active session (silently no-ops),
-- the profile row would not exist. The subsequent SELECT email FROM profiles
-- would return NULL, causing the INSERT into game_join_requests to fail with a
-- NOT NULL constraint violation — surfaced as a generic 500 in the API.
-- This change converts that silent failure to a named exception the API can map
-- to a 422 with a user-friendly message.
--
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

  -- Verify profile exists before attempting insert (profile may be missing if
  -- claim_profile ran without an active session and silently no-oped)
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Check for any existing request row for this user+league
  SELECT * INTO v_existing
  FROM game_join_requests
  WHERE game_id = p_game_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      RAISE EXCEPTION 'Request already pending';
    ELSIF v_existing.status = 'approved' THEN
      RAISE EXCEPTION 'Already a member';
    ELSIF v_existing.status = 'declined' THEN
      UPDATE game_join_requests
      SET status     = 'pending',
          message    = p_message,
          updated_at = now()
      WHERE id = v_existing.id;
      RETURN;
    END IF;
  END IF;

  -- Look up profile details and insert fresh row
  SELECT email, display_name INTO v_email, v_display_name
  FROM profiles
  WHERE id = v_user_id;

  INSERT INTO game_join_requests (game_id, user_id, email, display_name, message)
  VALUES (p_game_id, v_user_id, v_email, COALESCE(v_display_name, v_email), p_message);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(UUID, TEXT) TO authenticated;
