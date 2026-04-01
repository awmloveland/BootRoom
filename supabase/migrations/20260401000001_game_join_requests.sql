-- supabase/migrations/20260401000001_game_join_requests.sql
--
-- Adds the game_join_requests table and submit_join_request RPC to support
-- the league join request flow. Users who discover a public league can submit
-- a request to join; admins approve or decline via the member management UI.
--

-- ── game_join_requests ────────────────────────────────────────────────────────
CREATE TABLE game_join_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL,
  display_name text NOT NULL,
  message      text,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Only one pending request per user per league; declined users may re-request
CREATE UNIQUE INDEX game_join_requests_pending_unique
  ON game_join_requests (game_id, user_id)
  WHERE status = 'pending';

ALTER TABLE game_join_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests; admins can read all for their leagues
CREATE POLICY "Users view own join requests" ON game_join_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_game_admin(game_id));

-- Admins can update status/reviewed_by when approving or declining (Phase 2)
CREATE POLICY "Admins update join request status" ON game_join_requests
  FOR UPDATE TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (is_game_admin(game_id));

CREATE TRIGGER game_join_requests_set_updated_at
  BEFORE UPDATE ON game_join_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── submit_join_request ───────────────────────────────────────────────────────
-- Called by an authenticated user to request membership in a league.
-- Looks up the caller's email from auth.users and display_name from profiles.
-- Raises 'duplicate_request' if a pending request already exists for this
-- (game_id, user_id) pair — caught by the API route as a 409.
CREATE OR REPLACE FUNCTION public.submit_join_request(
  p_game_id uuid,
  p_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_email        text;
  v_display_name text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up email from auth.users
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Look up display_name from profiles
  SELECT display_name INTO v_display_name
  FROM profiles
  WHERE id = v_user_id;

  -- Check for duplicate pending request
  IF EXISTS (
    SELECT 1 FROM game_join_requests
    WHERE game_id = p_game_id AND user_id = v_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'duplicate_request';
  END IF;

  INSERT INTO game_join_requests (game_id, user_id, email, display_name, message)
  VALUES (p_game_id, v_user_id, v_email, v_display_name, p_message);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(uuid, text) TO authenticated;
