-- S2: rotate the push-prayer cron job to send an x-cron-secret header.
--
-- Operator prerequisites BEFORE running this migration:
--   1. Deploy the updated push-prayer edge function (with verifyCronSecret).
--   2. supabase secrets set CRON_SECRET=<random-32-byte-hex> (env for the function).
--   3. Insert the same value into Vault under the name 'cron_secret'
--      (Supabase Dashboard → Project → Vault → New secret).
--
-- If any of these are missing the cron will start returning 403 — that is the
-- failure mode we want, since the previous open endpoint was the bug we are
-- fixing.

select cron.unschedule('push-prayer-every-minute');

select cron.schedule(
  'push-prayer-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ckrvxajivwkifticnqom.supabase.co/functions/v1/push-prayer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
