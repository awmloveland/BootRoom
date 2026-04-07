-- supabase/migrations/20260407000004_fix_claim_on_join_request.sql
--
-- The previous join request flow called submit_player_claim from the API route
-- after submit_join_request, but submit_player_claim requires game_members
-- membership — which the user doesn't have until their request is approved.
-- The claim silently failed, losing the player name entirely.
--
-- Fix: accept p_player_name in submit_join_request and, if provided, insert
-- directly into player_claims inside the SECURITY DEFINER function (bypassing
-- the member check). The claim is created alongside the join request and
-- appears as a pending chip in PendingRequestsTable when the admin reviews.
--
-- ON CONFLICT DO NOTHING handles two edge cases silently:
--   1. User somehow already has a claim row (game_id, user_id) unique constraint
--   2. Another user already has a pending/approved claim for that player name

-- ── game_join_requests — add player_name column ───────────────────────────────
ALTER TABLE game_join_requests ADD COLUMN IF NOT EXISTS player_name text;

-- ── submit_join_request — accept and store player name + create claim ─────────
CREATE OR REPLACE FUNCTION public.submit_join_request(
  p_game_id     UUID,
  p_message     TEXT DEFAULT NULL,
  p_player_name TEXT DEFAULT NULL
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
  v_request_id   UUID;
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

  -- Verify profile exists before attempting insert
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
      SET status      = 'pending',
          message     = p_message,
          player_name = p_player_name,
          updated_at  = now()
      WHERE id = v_existing.id;
      v_request_id := v_existing.id;
    END IF;
  ELSE
    -- Look up profile details and insert fresh row
    SELECT email, display_name INTO v_email, v_display_name
    FROM profiles
    WHERE id = v_user_id;

    INSERT INTO game_join_requests (game_id, user_id, email, display_name, message, player_name)
    VALUES (p_game_id, v_user_id, v_email, COALESCE(v_display_name, v_email), p_message, p_player_name)
    RETURNING id INTO v_request_id;
  END IF;

  -- If a player name was provided, create a pending claim directly.
  -- This bypasses submit_player_claim's member check (user is not yet a member).
  -- ON CONFLICT DO NOTHING: silently skip if the player is already claimed
  -- by another user, or if this user already has a claim row.
  IF p_player_name IS NOT NULL AND p_player_name <> '' THEN
    INSERT INTO player_claims (game_id, user_id, player_name)
    VALUES (p_game_id, v_user_id, p_player_name)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(UUID, TEXT, TEXT) TO authenticated;
-- Keep old 2-arg signature working (for any cached/old clients)
GRANT EXECUTE ON FUNCTION public.submit_join_request(UUID, TEXT) TO authenticated;
