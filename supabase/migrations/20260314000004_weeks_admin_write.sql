-- ============================================================
-- Tighten weeks write access: admins only for INSERT/UPDATE.
-- Previously any league member could insert weeks.
-- ============================================================

-- Drop the existing broad member insert policy
DROP POLICY IF EXISTS "Game members insert weeks" ON weeks;

-- Admins only: insert new weeks (scheduled or played)
CREATE POLICY "Admins insert weeks" ON weeks
  FOR INSERT TO authenticated
  WITH CHECK (is_game_admin(game_id));

-- Admins only: update weeks (save lineup, record result)
CREATE POLICY "Admins update weeks" ON weeks
  FOR UPDATE TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (is_game_admin(game_id));
