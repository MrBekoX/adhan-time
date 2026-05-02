-- Schedule push-prayer edge function every minute.
--
-- Notes:
-- * push-prayer was deployed with verify_jwt=false → no Authorization header needed.
-- * Supabase URL is public information (not a secret), so no Vault lookup required.
-- * pg_cron + pg_net extensions are enabled in the init migration.
--
-- If you ever flip verify_jwt=true on the function, switch this back to a Vault-based
-- variant that fetches `service_role_key` from `vault.decrypted_secrets`.

select cron.schedule(
  'push-prayer-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ckrvxajivwkifticnqom.supabase.co/functions/v1/push-prayer',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
