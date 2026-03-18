-- supabase/migrations/20260318000001_profiles_role_and_experiments.sql

-- 1. Add role column to profiles
ALTER TABLE profiles
  ADD COLUMN role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'developer'));

-- 2. Create feature_experiments table
CREATE TABLE feature_experiments (
  feature     text PRIMARY KEY,
  available   boolean NOT NULL DEFAULT false,
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Seed with all current FeatureKey values
-- Active features start as available = true
INSERT INTO feature_experiments (feature, available) VALUES
  ('match_history',     true),
  ('match_entry',       true),
  ('team_builder',      true),
  ('player_stats',      true),
  ('player_comparison', false);

-- 4. RLS: only authenticated developers can write; all authenticated users can read
ALTER TABLE feature_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "developers can manage experiments"
  ON feature_experiments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'developer')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'developer')
  );

CREATE POLICY "authenticated users can read experiments"
  ON feature_experiments
  FOR SELECT
  TO authenticated
  USING (true);
