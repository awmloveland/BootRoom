-- supabase/migrations/20261117000002_platform_admin.sql
--
-- The platform admin portal at /platform. Who may open it is decided by the
-- app (PLATFORM_ADMIN_IDS on the server), never by the database, so nothing
-- here is reachable with a user's own session:
--
--   1. platform_audit_log: what platform admins did, with a snapshot of
--      anything deleted. Service role only.
--   2. platform_leagues(): one row per league with its counts.
--   3. platform_delete_league(): snapshot, then delete, in one transaction.
--   4. 'platform' joins the reserved league addresses.
--   5. profiles.role goes. Nothing read it, and any signed-in user could set
--      their own to 'developer' through the "Users update own profile" policy.
--
-- Both functions run with the caller's rights, so if a grant ever slipped,
-- RLS would still stand between a user and other leagues' data.
-- Safe to run twice.

-- ── 1. Audit log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text NOT NULL,
  actor_id    uuid,
  -- Copied at write time so the entry survives the actor's account.
  actor_email text,
  game_id     uuid,
  game_slug   text,
  game_name   text,
  snapshot    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS on with no policies: no user session can read or write a row.
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON platform_audit_log TO service_role;

-- ── 2. platform_leagues ──────────────────────────────────────────────────────
-- "Results" are weeks that were played or abandoned (dnf). "Last activity" is
-- the newest week row; weeks carry no updated timestamp.
CREATE OR REPLACE FUNCTION public.platform_leagues()
RETURNS TABLE (
  id            uuid,
  name          text,
  slug          text,
  created_at    timestamptz,
  location      text,
  day           text,
  kickoff_time  text,
  creator_name  text,
  creator_email text,
  members       int,
  players       int,
  results       int,
  last_activity timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT g.id, g.name, g.slug, g.created_at, g.location, g.day, g.kickoff_time,
         coalesce(
           nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
           nullif(trim(p.display_name), '')
         ),
         p.email,
         (SELECT count(*)::int FROM game_members m WHERE m.game_id = g.id),
         (SELECT count(*)::int FROM player_attributes a WHERE a.game_id = g.id),
         (SELECT count(*)::int FROM weeks w WHERE w.game_id = g.id AND w.status IN ('played', 'dnf')),
         (SELECT max(w.created_at) FROM weeks w WHERE w.game_id = g.id)
    FROM games g
    LEFT JOIN profiles p ON p.id = g.created_by
   ORDER BY g.created_at DESC;
$$;

-- Supabase grants EXECUTE on new functions to every role, so take it back.
REVOKE ALL ON FUNCTION public.platform_leagues() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_leagues() TO service_role;

-- ── 3. platform_delete_league ────────────────────────────────────────────────
-- Every table that references games cascades on delete (checked against
-- production on 2026-11-17), so deleting the games row removes the lot. The
-- snapshot lists those same ten tables; add any new one here too.
CREATE OR REPLACE FUNCTION public.platform_delete_league(p_game_id uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_game games%ROWTYPE;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  INSERT INTO platform_audit_log (action, actor_id, actor_email, game_id, game_slug, game_name, snapshot)
  VALUES (
    'delete_league',
    p_actor,
    (SELECT email FROM profiles WHERE id = p_actor),
    v_game.id,
    v_game.slug,
    v_game.name,
    jsonb_build_object(
      'games',              to_jsonb(v_game),
      'game_members',       (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM game_members t       WHERE t.game_id = p_game_id),
      'game_invites',       (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM game_invites t       WHERE t.game_id = p_game_id),
      'weeks',              (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM weeks t              WHERE t.game_id = p_game_id),
      'config',             (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM config t             WHERE t.game_id = p_game_id),
      'league_features',    (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM league_features t    WHERE t.game_id = p_game_id),
      'player_attributes',  (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM player_attributes t  WHERE t.game_id = p_game_id),
      'game_join_requests', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM game_join_requests t WHERE t.game_id = p_game_id),
      'player_claims',      (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM player_claims t      WHERE t.game_id = p_game_id),
      'week_fees',          (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM week_fees t          WHERE t.game_id = p_game_id),
      'week_payments',      (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM week_payments t      WHERE t.game_id = p_game_id)
    )
  );

  DELETE FROM games WHERE id = p_game_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_delete_league(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_league(uuid, uuid) TO service_role;

-- ── 4. Reserve the address ───────────────────────────────────────────────────
-- Same constraint as 20261116000001 with 'platform' added.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_slug_format;
ALTER TABLE games ADD CONSTRAINT games_slug_format CHECK (
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND char_length(slug) <= 100
  AND slug NOT IN ('api', 'app', 'auth', 'invite', 'new', 'platform', 'profile-required', 'results', 'settings', 'sign-in')
);

-- ── 5. Retire profiles.role ──────────────────────────────────────────────────
-- Its default and check constraint are the only things that depend on it
-- (checked against production on 2026-11-17) and go with the column.
ALTER TABLE profiles DROP COLUMN IF EXISTS role;
