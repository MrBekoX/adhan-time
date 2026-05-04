-- S1: per-IP rate limiter for the register-device edge function.
-- The bucket is keyed by SHA-256(ip)[:32]; the edge function increments the
-- count, the cleanup cron deletes stale rows.

create table if not exists public.rl_buckets (
  ip_hash text primary key,
  request_count int not null default 0,
  window_start timestamptz not null default now()
);

create index if not exists rl_buckets_window_idx on public.rl_buckets(window_start);

-- Same pattern as the rest of the project: RLS on, no policies. Edge function
-- writes via SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
alter table public.rl_buckets enable row level security;
