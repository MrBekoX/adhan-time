-- V12: prevent duplicate push for the same prayer/device/local-date.
-- A 60-second cron window (see push-window.ts) means the cron may fire twice
-- for the same prayer minute. The unique index makes the second insert a no-op.

alter table public.push_log
  add column if not exists local_date date;

-- Backfill any rows that predate the schema change. UTC date is a reasonable
-- default — pre-V12 cron used minute-equality so the local_date for a given
-- (device, prayer_key) pair was effectively unique anyway.
update public.push_log
  set local_date = (sent_at at time zone 'UTC')::date
  where local_date is null;

-- Drop any duplicates that may have slipped in before the constraint exists,
-- keeping the lowest id (i.e. the first send) per (device, prayer, local_date).
delete from public.push_log a
  using public.push_log b
  where a.device_id = b.device_id
    and a.prayer_key = b.prayer_key
    and a.local_date = b.local_date
    and a.id > b.id;

alter table public.push_log
  alter column local_date set not null;

create unique index if not exists push_log_dedup_idx
  on public.push_log(device_id, prayer_key, local_date);
