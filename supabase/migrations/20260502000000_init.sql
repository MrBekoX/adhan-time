-- adhan-time initial schema
-- devices: registered mobile clients (token + location + tz + preferences)
-- prayer_cache: server-side yearly prayer time cache per district
-- push_log: audit of push notifications sent

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  expo_push_token text not null unique,
  district_id text not null,
  district_name text not null,
  country_name text not null,
  timezone text not null,
  locale text not null default 'tr',
  sound text not null default 'default',
  enabled_prayers text[] not null default array['imsak','gunes','ogle','ikindi','aksam','yatsi'],
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devices_tz_idx on public.devices(timezone);
create index if not exists devices_district_idx on public.devices(district_id);
create index if not exists devices_last_seen_idx on public.devices(last_seen_at);

create table if not exists public.prayer_cache (
  district_id text primary key,
  year int not null,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists public.push_log (
  id bigserial primary key,
  device_id uuid references public.devices(id) on delete cascade,
  prayer_key text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz not null default now(),
  expo_response jsonb
);

create index if not exists push_log_sent_idx on public.push_log(sent_at);

-- RLS strategy (intentional):
-- All three tables enable RLS but expose NO policies. This makes them effectively
-- default-deny for anon/authenticated callers. All writes happen from edge
-- functions using SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS).
-- Supabase advisor will report `rls_enabled_no_policy` (INFO level); that is by
-- design — do not "fix" it by adding permissive policies for anon.
alter table public.devices enable row level security;
alter table public.prayer_cache enable row level security;
alter table public.push_log enable row level security;
