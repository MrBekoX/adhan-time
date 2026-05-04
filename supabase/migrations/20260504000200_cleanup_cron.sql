-- S4/S5: daily housekeeping for the audit trail.
--
-- * devices  : drop rows that have been silent for 180 days (KVKK/GDPR
--              retention — re-registers on next app open if the user is
--              still active).
-- * push_log : retain 30 days of audit trail.
-- * rl_buckets : a single 60-second window is enough; nightly purge keeps
--              the table from growing unbounded.

select cron.schedule(
  'cleanup-stale-data',
  '0 3 * * *', -- daily at 03:00 UTC
  $$
  delete from public.devices    where last_seen_at < now() - interval '180 days';
  delete from public.push_log   where sent_at      < now() - interval '30 days';
  delete from public.rl_buckets where window_start < now() - interval '1 day';
  $$
);
