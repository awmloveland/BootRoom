-- Add visibility tier to league_features.
-- Existing rows (already rolled out features) default to 'members'.
-- New features added in code should always set visibility = 'admin_only'.
ALTER TABLE league_features
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'members'
  CHECK (visibility IN ('admin_only', 'members', 'public'));
