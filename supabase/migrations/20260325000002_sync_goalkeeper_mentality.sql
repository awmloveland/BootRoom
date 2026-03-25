-- Backfill mentality = 'goalkeeper' for all players whose goalkeeper flag is true
-- but whose mentality was never explicitly set (still at default 'balanced').
-- After this migration, the goalkeeper boolean is no longer the source of truth
-- for display — the mentality column covers it.

UPDATE player_attributes
SET mentality = 'goalkeeper'
WHERE goalkeeper = true
  AND mentality = 'balanced';
