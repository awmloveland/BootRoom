-- supabase/migrations/20261119000002_drop_waitlist_signups.sql
--
-- The landing page waitlist was replaced by "Start your league" (#198), and
-- nothing reads or writes this table any more. Dropping it removes the names
-- and email addresses it holds.
--
-- Before running: tell anyone still on the list that sign-up is open.
--   select name, email, created_at from waitlist_signups order by created_at;

drop table if exists waitlist_signups;
