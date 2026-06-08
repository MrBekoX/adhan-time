-- Pre-prayer reminder lead time, in minutes (0 = off). The push-prayer cron
-- fallback reads this to fire a "Yaklaşıyor / Coming up" reminder reminder_minutes
-- before each enabled prayer for stale devices. Forward-only (rules/05): existing
-- rows backfill to 0 so server behavior is unchanged until a device re-registers
-- with a non-zero value.
alter table public.devices
  add column if not exists reminder_minutes int not null default 0;
