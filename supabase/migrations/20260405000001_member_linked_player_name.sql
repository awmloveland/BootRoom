-- supabase/migrations/20260405000001_member_linked_player_name.sql
--
-- 1. Extend get_league_members to include linked_player_name from approved player_claims.
-- 2. Fix get_player_claims to use profiles.email instead of auth.users.email.
--

-- ── get_league_members ──────────────────────────────────────────────────────────
-- Must DROP before recreating because the RETURNS TABLE definition is changing.
DROP FUNCTION IF EXISTS public.get_league_members(uuid);

CREATE FUNCTION public.get_league_members(p_game_id uuid)
RETURNS TABLE (
  user_id            uuid,
  email              text,
  display_name       text,
  role               text,
  joined_at          timestamptz,
  linked_player_name text          -- NULL if no approved claim for this member
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    gm.user_id,
    p.email,
    p.display_name,
    gm.role,
    gm.joined_at,
    COALESCE(pc.admin_override_name, pc.player_name) AS linked_player_name
  FROM game_members gm
  JOIN profiles p ON p.id = gm.user_id
  LEFT JOIN player_claims pc
    ON  pc.game_id  = p_game_id
    AND pc.user_id  = gm.user_id
    AND pc.status   = 'approved'
  WHERE gm.game_id = p_game_id
    AND is_game_admin(p_game_id)
  ORDER BY
    CASE gm.role WHEN 'creator' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    gm.joined_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_members(uuid) TO authenticated;

-- ── get_player_claims ───────────────────────────────────────────────────────────
-- Fix: remove LEFT JOIN auth.users (restricted schema — causes RPC failure).
-- profiles is already joined as pr and has an email column; use pr.email directly.
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
    pr.email
  FROM player_claims pc
  LEFT JOIN profiles pr ON pr.id = pc.user_id
  WHERE pc.game_id = p_game_id
  ORDER BY pc.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_claims(uuid) TO authenticated;
