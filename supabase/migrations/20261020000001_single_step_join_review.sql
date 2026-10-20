-- supabase/migrations/20261020000001_single_step_join_review.sql
--
-- Single-step join request review.
--
-- Before: a join request made with a player name also created a pending
-- player_claims row, and the admin approved the two separately. People who
-- said they were new got no player at all.
--
-- After:
--   * submit_join_request only records what the requester chose
--     (player_name, played_before). It no longer creates a claim.
--   * approve_join_request does everything in one transaction: links an
--     existing player or creates a new one, adds the member, and approves.
--   * approve_player_claim does the same for claims from existing members.
--   * Declining a join request also rejects any pending claim left over from
--     requests made before this change.

BEGIN;

-- ── 1. played_before ─────────────────────────────────────────────────────────
ALTER TABLE game_join_requests ADD COLUMN IF NOT EXISTS played_before boolean;

-- ── 2. submit_join_request ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_join_request(uuid, text);
DROP FUNCTION IF EXISTS public.submit_join_request(uuid, text, text);

CREATE OR REPLACE FUNCTION public.submit_join_request(
  p_game_id       uuid,
  p_message       text    DEFAULT NULL,
  p_player_name   text    DEFAULT NULL,
  p_played_before boolean DEFAULT NULL
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
  v_existing     game_join_requests%ROWTYPE;
  v_player_name  text := NULLIF(btrim(p_player_name), '');
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Already a member';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT * INTO v_existing
  FROM game_join_requests
  WHERE game_id = p_game_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      RAISE EXCEPTION 'Request already pending';
    ELSIF v_existing.status = 'approved' THEN
      RAISE EXCEPTION 'Already a member';
    ELSE
      UPDATE game_join_requests
      SET status        = 'pending',
          message       = p_message,
          player_name   = v_player_name,
          played_before = p_played_before,
          reviewed_by   = NULL,
          updated_at    = now()
      WHERE id = v_existing.id;
    END IF;
  ELSE
    SELECT email, display_name INTO v_email, v_display_name
    FROM profiles
    WHERE id = v_user_id;

    INSERT INTO game_join_requests
      (game_id, user_id, email, display_name, message, player_name, played_before)
    VALUES
      (p_game_id, v_user_id, v_email, COALESCE(v_display_name, v_email),
       p_message, v_player_name, p_played_before);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(uuid, text, text, boolean) TO authenticated;

-- ── 3. get_join_requests: also return player_name and played_before ─────────
-- The return type changes, so the function must be dropped first.
DROP FUNCTION IF EXISTS public.get_join_requests(uuid);

CREATE FUNCTION public.get_join_requests(p_game_id uuid)
RETURNS TABLE (
  id            uuid,
  user_id       uuid,
  email         text,
  display_name  text,
  message       text,
  status        text,
  created_at    timestamptz,
  player_name   text,
  played_before boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Qualified: "user_id" is also an output column name.
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
    gjr.created_at,
    gjr.player_name,
    gjr.played_before
  FROM game_join_requests gjr
  WHERE gjr.game_id = p_game_id
    AND gjr.status = 'pending'
  ORDER BY gjr.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_join_requests(uuid) TO authenticated;

-- ── 4. link_reviewed_player (internal) ───────────────────────────────────────
-- Links p_user_id to a player, creating the player first when asked.
-- Shared by approve_join_request and approve_player_claim. Not callable by
-- clients; the approve functions run as the owner and may call it.
CREATE OR REPLACE FUNCTION public.link_reviewed_player(
  p_game_id       uuid,
  p_user_id       uuid,
  p_player_name   text,
  p_create_player boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_player_name, ''));
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'player_name_required';
  END IF;

  -- Two admins approving the same name at once: the second waits, then
  -- fails the checks below instead of hitting a unique index.
  PERFORM pg_advisory_xact_lock(hashtext(p_game_id::text || ':' || lower(v_name)));

  IF COALESCE(p_create_player, false) THEN
    -- Same case-insensitive rule as "+ Add player".
    IF EXISTS (
      SELECT 1 FROM player_attributes
      WHERE game_id = p_game_id AND lower(name) = lower(v_name)
    ) THEN
      RAISE EXCEPTION 'player_exists';
    END IF;

    -- Defaults match "+ Add player": strength average (rating 2), balanced.
    INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
    VALUES (p_game_id, v_name, 2, 'balanced', false);
  ELSE
    -- Older players may only exist in played line-ups.
    IF NOT EXISTS (
      SELECT 1 FROM player_attributes
      WHERE game_id = p_game_id AND name = v_name
    ) AND NOT EXISTS (
      SELECT 1 FROM weeks w
      WHERE w.game_id = p_game_id
        AND w.status = 'played'
        AND (w.team_a ? v_name OR w.team_b ? v_name)
    ) THEN
      RAISE EXCEPTION 'player_not_found';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id
      AND user_id <> p_user_id
      AND status = 'approved'
      AND (player_name = v_name OR admin_override_name = v_name)
  ) THEN
    RAISE EXCEPTION 'player_already_linked';
  END IF;

  -- player_claims allows one pending/approved claim per name.
  IF EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id
      AND user_id <> p_user_id
      AND status = 'pending'
      AND player_name = v_name
  ) THEN
    RAISE EXCEPTION 'player_claim_pending';
  END IF;

  INSERT INTO player_claims (game_id, user_id, player_name, status, reviewed_by)
  VALUES (p_game_id, p_user_id, v_name, 'approved', auth.uid())
  ON CONFLICT (game_id, user_id) DO UPDATE
    SET player_name         = EXCLUDED.player_name,
        admin_override_name = NULL,
        status              = 'approved',
        reviewed_by         = EXCLUDED.reviewed_by,
        updated_at          = now();

  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.link_reviewed_player(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- ── 5. approve_join_request ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_join_request(
  p_request_id    uuid,
  p_player_name   text,
  p_create_player boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request game_join_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request FROM game_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF NOT is_game_admin(v_request.game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  END IF;

  PERFORM link_reviewed_player(v_request.game_id, v_request.user_id, p_player_name, p_create_player);

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (v_request.game_id, v_request.user_id, 'member')
  ON CONFLICT (game_id, user_id) DO NOTHING;

  UPDATE game_join_requests
  SET status      = 'approved',
      reviewed_by = auth.uid(),
      updated_at  = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid, text, boolean) TO authenticated;

-- ── 6. approve_player_claim ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_player_claim(
  p_claim_id      uuid,
  p_player_name   text,
  p_create_player boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim player_claims%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_claim FROM player_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF NOT is_game_admin(v_claim.game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'claim_not_pending';
  END IF;

  -- Upserts this user's claim row (the one being approved) to approved.
  PERFORM link_reviewed_player(v_claim.game_id, v_claim.user_id, p_player_name, p_create_player);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_player_claim(uuid, text, boolean) TO authenticated;

-- ── 7. review_join_request: pending only; declining rejects a leftover claim
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

  SELECT * INTO v_request FROM game_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = v_request.game_id
      AND user_id = v_admin_id
      AND role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- A late or double-clicked decline must not overwrite an approval.
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  END IF;

  UPDATE game_join_requests
  SET status      = p_action,
      reviewed_by = v_admin_id,
      updated_at  = now()
  WHERE id = p_request_id;

  IF p_action = 'approved' THEN
    INSERT INTO game_members (game_id, user_id, role)
    VALUES (v_request.game_id, v_request.user_id, 'member')
    ON CONFLICT (game_id, user_id) DO NOTHING;
  ELSE
    UPDATE player_claims
    SET status      = 'rejected',
        reviewed_by = v_admin_id,
        updated_at  = now()
    WHERE game_id = v_request.game_id
      AND user_id = v_request.user_id
      AND status  = 'pending';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_join_request(uuid, text) TO authenticated;

COMMIT;

-- Let PostgREST see the new signatures straight away.
NOTIFY pgrst, 'reload schema';
