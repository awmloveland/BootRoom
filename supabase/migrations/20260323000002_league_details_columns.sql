-- Add league detail columns to games table
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS location    text,
  ADD COLUMN IF NOT EXISTS day         text,
  ADD COLUMN IF NOT EXISTS kickoff_time text,
  ADD COLUMN IF NOT EXISTS bio         text;
