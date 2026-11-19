-- supabase/migrations/20261119000004_purge_league_snapshots.sql
--
-- platform_delete_league keeps a full copy of a deleted league in
-- platform_audit_log.snapshot, players' names included, and nothing ever
-- removed it. A daily job now clears the copy 30 days after the delete. The
-- log line itself (who deleted which league, and when) stays.
--
-- Uses pg_cron, Supabase's scheduler. Scheduling under the same name replaces
-- the job, so this is safe to run twice. To check it afterwards:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'purge-league-snapshots',
  '17 3 * * *', -- daily at 03:17 UTC
  $$update public.platform_audit_log
       set snapshot = null
     where snapshot is not null
       and created_at < now() - interval '30 days'$$
);
