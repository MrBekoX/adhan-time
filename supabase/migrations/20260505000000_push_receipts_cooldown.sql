-- F1/V12: poll Expo receipts and cool down rate-limited devices.
--
-- Operator prerequisites BEFORE running this migration:
--   1. Deploy the push-receipts edge function.
--   2. Keep CRON_SECRET configured for both push-prayer and push-receipts.
--   3. Keep the same value in Vault under the name 'cron_secret'.

alter table public.devices
  add column if not exists rate_limited_until timestamptz;

create index if not exists devices_rate_limited_until_idx
  on public.devices(rate_limited_until);

select cron.unschedule(jobid)
  from cron.job
  where jobname = 'push-receipts-every-five-minutes';

select cron.schedule(
  'push-receipts-every-five-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ckrvxajivwkifticnqom.supabase.co/functions/v1/push-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
