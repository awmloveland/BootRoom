-- supabase/migrations/20261006000001_admin_money.sql
--
-- Pitch fees for the admin-only Admin tab: a league default cost per player,
-- an optional per-week override, and one payment row per payer per week.
-- Admins read and write all of it; nobody else can read it.
--
-- week_fees and week_payments carry game_id alongside week_id so a league's
-- rows can be fetched in one query and RLS can check is_game_admin() without
-- a join. The insert/update policies check that the week belongs to that game.

-- ── League default ────────────────────────────────────────────────────────────
-- £7 per player per game for existing and new leagues; admins change it on the Admin tab.
ALTER TABLE games ADD COLUMN IF NOT EXISTS fee_per_player numeric(6,2) NOT NULL DEFAULT 7
  CHECK (fee_per_player >= 0);

-- ── Per-week override (absent = use the league default) ──────────────────────
CREATE TABLE IF NOT EXISTS week_fees (
  week_id        uuid PRIMARY KEY REFERENCES weeks(id) ON DELETE CASCADE,
  game_id        uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  fee_per_player numeric(6,2) NOT NULL CHECK (fee_per_player >= 0)
);

CREATE INDEX IF NOT EXISTS week_fees_game_id_idx ON week_fees (game_id);

-- ── Payments (absent = unpaid) ────────────────────────────────────────────────
-- payer is the player's name, or the guest's name for a +1 (e.g. 'Alice +1').
CREATE TABLE IF NOT EXISTS week_payments (
  week_id   uuid NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  game_id   uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  payer     text NOT NULL,
  paid      boolean NOT NULL DEFAULT true,
  paid_at   timestamptz DEFAULT now(),
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (week_id, payer)
);

CREATE INDEX IF NOT EXISTS week_payments_game_id_idx ON week_payments (game_id);

-- ── RLS: admins of the game only ──────────────────────────────────────────────
ALTER TABLE week_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage week_fees" ON week_fees
  FOR ALL TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (
    is_game_admin(game_id)
    AND EXISTS (SELECT 1 FROM weeks w WHERE w.id = week_id AND w.game_id = week_fees.game_id)
  );

CREATE POLICY "Admins manage week_payments" ON week_payments
  FOR ALL TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (
    is_game_admin(game_id)
    AND EXISTS (SELECT 1 FROM weeks w WHERE w.id = week_id AND w.game_id = week_payments.game_id)
  );
