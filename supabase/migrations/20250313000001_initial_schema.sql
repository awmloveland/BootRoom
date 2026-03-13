-- Craft Football — Initial schema
-- Run this in Supabase SQL Editor after creating your project

-- League config (single row, jsonb for flexibility)
CREATE TABLE config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Weeks (match records)
CREATE TABLE weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  week int NOT NULL,
  date text NOT NULL,
  status text NOT NULL CHECK (status IN ('played', 'cancelled', 'scheduled')),
  format text,
  team_a jsonb NOT NULL DEFAULT '[]',
  team_b jsonb NOT NULL DEFAULT '[]',
  winner text CHECK (winner IN ('teamA', 'teamB', 'draw') OR winner IS NULL),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(season, week)
);

-- Profiles: links auth.users to league membership
-- Only users in profiles can access the app (invite-only)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS: only users with a profile (invited league members) can read weeks and config
CREATE POLICY "Profiled users read weeks" ON weeks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Profiled users read config" ON config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

-- RLS: users can read their own profile
CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

-- RLS: only users in profiles can access the app (enforced in middleware)
-- We allow read for any authenticated user; profile check happens in app layer
-- Alternatively: use a policy that joins to profiles - but auth.users might not be exposed
-- Simpler: allow authenticated read, check profile existence in middleware

-- RLS: profiles insert — allow service role for migration; or use trigger on signup
CREATE POLICY "Users insert own profile" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Index for common queries
CREATE INDEX idx_weeks_season_week ON weeks(season, week DESC);
CREATE INDEX idx_weeks_status ON weeks(status);
