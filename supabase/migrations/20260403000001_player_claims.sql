-- supabase/migrations/20260403000001_player_claims.sql
--
-- Phase 1 of the player identity claim feature.
-- Creates player_claims table, partial unique index, RLS policies,
-- and all six RPCs for the claim lifecycle.
--

-- ── player_claims ──────────────────────────────────────────────────────────────
CREATE TABLE player_claims (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id              uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name          text NOT NULL,
  admin_override_name  text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by          uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)
);

-- Prevents two users claiming the same player (pending or approved).
-- Rejected claims release the name back to the pool.
CREATE UNIQUE INDEX player_claims_one_per_player
  ON player_claims (game_id, player_name)
  WHERE status IN ('pending', 'approved');

ALTER TABLE player_claims ENABLE ROW LEVEL SECURITY;

-- Members can read only their own claim rows; admins can read all for their leagues
CREATE POLICY "Members read own claims" ON player_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_game_admin(game_id));

-- Members can delete only their own claim rows
CREATE POLICY "Members delete own claims" ON player_claims
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admins can update any claim row for their leagues
CREATE POLICY "Admins update claims" ON player_claims
  FOR UPDATE TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (is_game_admin(game_id));

CREATE TRIGGER player_claims_set_updated_at
  BEFORE UPDATE ON player_claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── submit_player_claim ────────────────────────────────────────────────────────
-- Called by an authenticated league member to claim a player name.
-- - If no row exists: inserts with status pending.
-- - If a rejected row exists for this user+league: resets to pending with new name.
-- - If a pending or approved row exists: raises 'claim_already_exists'.
-- - If the player name is already pending/approved by another user: raises 'player_already_claimed'.
CREATE OR REPLACE FUNCTION public.submit_player_claim(
  p_game_id     uuid,
  p_player_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_existing player_claims%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Must be a league member
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  -- Check for an existing row for this user+league
  SELECT * INTO v_existing
  FROM player_claims
  WHERE game_id = p_game_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing.status IN ('pending', 'approved') THEN
      RAISE EXCEPTION 'claim_already_exists';
    ELSIF v_existing.status = 'rejected' THEN
      -- Check the new player_name is not already taken by another user
      IF EXISTS (
        SELECT 1 FROM player_claims
        WHERE game_id = p_game_id
          AND player_name = p_player_name
          AND status IN ('pending', 'approved')
          AND user_id <> v_user_id
      ) THEN
        RAISE EXCEPTION 'player_already_claimed';
      END IF;
      -- Reset rejected row to pending with the new name
      UPDATE player_claims
      SET player_name         = p_player_name,
          admin_override_name = NULL,
          status              = 'pending',
          reviewed_by         = NULL,
          updated_at          = now()
      WHERE id = v_existing.id;
      RETURN;
    END IF;
  END IF;

  -- No existing row — insert fresh.
  -- The partial unique index enforces player_name uniqueness for pending/approved.
  INSERT INTO player_claims (game_id, user_id, player_name)
  VALUES (p_game_id, v_user_id, p_player_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_player_claim(uuid, text) TO authenticated;

-- ── review_player_claim ────────────────────────────────────────────────────────
-- Called by an admin/creator to approve or reject a pending claim.
-- If approved and p_override_name is provided, sets admin_override_name.
CREATE OR REPLACE FUNCTION public.review_player_claim(
  p_claim_id      uuid,
  p_action        text,       -- 'approved' or 'rejected'
  p_override_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim    player_claims%ROWTYPE;
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_claim FROM player_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF NOT is_game_admin(v_claim.game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE player_claims
  SET status              = p_action,
      reviewed_by         = v_admin_id,
      admin_override_name = CASE
                              WHEN p_action = 'approved' THEN p_override_name
                              ELSE admin_override_name
                            END,
      updated_at          = now()
  WHERE id = p_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_player_claim(uuid, text, text) TO authenticated;

-- ── assign_player_link ─────────────────────────────────────────────────────────
-- Called by an admin/creator to directly assign a player name to a user,
-- creating an already-approved claim. Replaces any existing claim for that
-- user+league (upsert on the UNIQUE (game_id, user_id) constraint).
CREATE OR REPLACE FUNCTION public.assign_player_link(
  p_game_id     uuid,
  p_user_id     uuid,
  p_player_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO player_claims (game_id, user_id, player_name, status, reviewed_by)
  VALUES (p_game_id, p_user_id, p_player_name, 'approved', auth.uid())
  ON CONFLICT (game_id, user_id) DO UPDATE
    SET player_name         = EXCLUDED.player_name,
        admin_override_name = NULL,
        status              = 'approved',
        reviewed_by         = EXCLUDED.reviewed_by,
        updated_at          = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_player_link(uuid, uuid, text) TO authenticated;

-- ── cancel_player_claim ────────────────────────────────────────────────────────
-- Called by the claim owner to delete a pending claim.
-- No-op (returns quietly) if the claim has already been reviewed or not found.
CREATE OR REPLACE FUNCTION public.cancel_player_claim(p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim player_claims%ROWTYPE;
BEGIN
  SELECT * INTO v_claim FROM player_claims WHERE id = p_claim_id;

  -- No-op if claim not found or already reviewed
  IF NOT FOUND OR v_claim.status <> 'pending' THEN
    RETURN;
  END IF;

  -- Only the owner may cancel
  IF v_claim.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM player_claims WHERE id = p_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_player_claim(uuid) TO authenticated;

-- ── get_player_claims ──────────────────────────────────────────────────────────
-- Returns all claims for a league (all statuses). Admin/creator only.
-- Joins with profiles for display_name and auth.users for email.
CREATE OR REPLACE FUNCTION public.get_player_claims(p_game_id uuid)
RETURNS TABLE (
  id                   uuid,
  game_id              uuid,
  user_id              uuid,
  player_name          text,
  admin_override_name  text,
  status               text,
  reviewed_by          uuid,
  created_at           timestamptz,
  updated_at           timestamptz,
  display_name         text,
  email                text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.game_id,
    pc.user_id,
    pc.player_name,
    pc.admin_override_name,
    pc.status,
    pc.reviewed_by,
    pc.created_at,
    pc.updated_at,
    pr.display_name,
    au.email
  FROM player_claims pc
  LEFT JOIN profiles pr ON pr.id = pc.user_id
  LEFT JOIN auth.users au ON au.id = pc.user_id
  WHERE pc.game_id = p_game_id
  ORDER BY pc.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_claims(uuid) TO authenticated;

-- ── get_unclaimed_players ─────────────────────────────────────────────────────
-- Returns distinct player names derived from match data for the league that
-- have no pending or approved claim. Used to populate the claim picker.
-- Requires the caller to be a league member.
CREATE OR REPLACE FUNCTION public.get_unclaimed_players(p_game_id uuid)
RETURNS TABLE (player_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.name
  FROM weeks w
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(w.team_a) AS name
    UNION
    SELECT jsonb_array_elements_text(w.team_b) AS name
  ) p
  WHERE w.game_id = p_game_id
    AND w.status = 'played'
    AND NOT EXISTS (
      SELECT 1 FROM player_claims pc
      WHERE pc.game_id = p_game_id
        AND pc.player_name = p.name
        AND pc.status IN ('pending', 'approved')
    )
  ORDER BY p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unclaimed_players(uuid) TO authenticated;
