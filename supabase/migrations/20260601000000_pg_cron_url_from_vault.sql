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
-- Operator prerequisites: 'cron_secret' must already be in Vault (the existing
-- cron uses it). 'supabase_url' is SELF-SEEDED below if missing, so this
-- migration is safe to run even on a project that never set it (the previous
-- cron hardcoded the URL, so it likely was never created).

-- (0) Self-seed the 'supabase_url' Vault secret if absent, so the cron URL below
-- always resolves. Idempotent: an existing secret (e.g. set during setup) is
-- left untouched. This runs FIRST — if it somehow fails, the cron reschedule
-- below never executes and the live cron keeps its current (working) definition.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'supabase_url') then
    perform vault.create_secret(
      'https://ckrvxajivwkifticnqom.supabase.co',
      'supabase_url',
      'Base URL for pg_cron net.http_post targets (auto-seeded)'
    );
  end if;
end
$$;

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
