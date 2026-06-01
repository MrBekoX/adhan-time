-- Resolve the cron HTTP target from Vault instead of a hardcoded project URL.
--
-- Why: earlier pg_cron migrations baked the literal project URL
-- (https://<ref>.supabase.co/...) into the scheduled job. On a project move,
-- branch, or ref change the cron would keep POSTing to the old host and the
-- server-push fallback would silently stop — with no error surfaced anywhere.
-- The base URL now comes from Vault ('supabase_url'), evaluated at each cron
-- run, so the job follows the environment it is deployed into.
--
-- Forward-only (rules/05): we do NOT edit the older migrations; we reschedule
-- the existing jobs in place. unschedule-by-jobname is guarded (no rows = no-op)
-- so this is idempotent and safe to re-run.
--
-- Operator prerequisites BEFORE running this migration (Supabase Dashboard →
-- Project → Vault → New secret):
--   * supabase_url = https://<your-ref>.supabase.co   (NO trailing slash)
--   * cron_secret  = <the same value set via `supabase secrets set CRON_SECRET=...`>
-- If 'supabase_url' is missing the URL resolves to NULL and the cron POST fails
-- loudly on the next tick — that is the intended fail-fast, not a silent wrong host.

-- push-prayer (every minute) ------------------------------------------------
select cron.unschedule(jobid)
  from cron.job
  where jobname = 'push-prayer-every-minute';

select cron.schedule(
  'push-prayer-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/push-prayer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- push-receipts (every five minutes) ---------------------------------------
select cron.unschedule(jobid)
  from cron.job
  where jobname = 'push-receipts-every-five-minutes';

select cron.schedule(
  'push-receipts-every-five-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/push-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
