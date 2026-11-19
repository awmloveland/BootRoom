-- supabase/migrations/20261119000003_lock_league_address.sql
--
-- A league's address (games.slug) is fixed when the league is created. The app
-- never changes it, but the "Admins update games" policy let a league admin
-- change it with a direct API call. This trigger refuses that.
--
-- The SQL editor (postgres) and the service role can still correct an
-- address. Safe to run twice.

CREATE OR REPLACE FUNCTION public.lock_game_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Runs with the caller's rights, so current_user is `authenticated` for a
  -- signed-in user's own request.
  IF NEW.slug IS DISTINCT FROM OLD.slug
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'A league address cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_lock_slug ON games;
CREATE TRIGGER games_lock_slug
  BEFORE UPDATE OF slug ON games
  FOR EACH ROW EXECUTE FUNCTION public.lock_game_slug();
