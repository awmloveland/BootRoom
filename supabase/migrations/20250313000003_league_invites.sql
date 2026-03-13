-- League invites: emails allowed to sign up (invite-only)
CREATE TABLE league_invites (
  email text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE league_invites ENABLE ROW LEVEL SECURITY;

-- Only service role can manage invites (no app policies for now)
-- Authenticated users cannot read invites (privacy)
-- Migration script uses service role to seed
