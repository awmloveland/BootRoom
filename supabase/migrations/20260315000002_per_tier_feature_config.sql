-- Replace single visibility column with independent per-tier enabled/config.
-- visibility was added 2026-03-15 and has not been deployed to production.
ALTER TABLE league_features DROP COLUMN IF EXISTS visibility;

-- public_enabled: whether the feature is on for unauthenticated/public visitors.
-- public_config: optional per-tier config (e.g. different column set for public vs members).
ALTER TABLE league_features
  ADD COLUMN IF NOT EXISTS public_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_config  jsonb DEFAULT null;
