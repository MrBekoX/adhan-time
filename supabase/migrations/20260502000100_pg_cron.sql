-- pg_cron job: invoke push-prayer edge function every minute.
-- ÖNKOŞUL: Vault'ta `supabase_url` ve `service_role_key` secret'ları kayıtlı olmalı.
-- Dashboard > Database > Vault'tan ekleyin, sonra bu migration'ı çalıştırın.

select cron.schedule(
  'push-prayer-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/push-prayer',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('source','cron')
  );
  $$
);
