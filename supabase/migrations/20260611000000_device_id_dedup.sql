-- device_id dedup: one row per physical device. Reinstalls (new push token) update
-- the same row instead of creating a new one. expo_push_token UNIQUE is kept.

alter table public.devices add column if not exists device_id text;

-- Partial unique: legacy NULL device_id rows don't collide; device_id-bearing rows are unique.
create unique index if not exists devices_device_id_key
  on public.devices (device_id) where device_id is not null;

-- Atomic adopt-then-upsert. SECURITY INVOKER → runs as the calling role
-- (service_role from the edge function), matching rl_consume — whose mutable
-- search_path convention this also follows; INVOKER + service_role-only execute
-- keeps the advisor INFO acceptably low-risk. The adopt UPDATE + token-collision
-- DELETE + INSERT…ON CONFLICT run in ONE transaction; the partial-unique index on
-- device_id serializes concurrent registrations so no duplicate device_id row can
-- be created. Assumes a PRE-VALIDATED payload (the edge validator already
-- constrains platform to null|android|ios; the column CHECK is the only backstop
-- for any future direct caller).
create or replace function public.upsert_device(p jsonb)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
  v_device_id text := nullif(p->>'device_id', '');
begin
  if v_device_id is not null then
    -- Adopt a legacy same-token row (stamp device_id once). Guard against an
    -- existing device_id row so this can never violate the partial-unique index.
    update public.devices
      set device_id = v_device_id
      where expo_push_token = p->>'expo_push_token'
        and device_id is null
        and not exists (select 1 from public.devices d where d.device_id = v_device_id);

    -- Clear any OTHER row still holding the incoming push token (a stale duplicate
    -- of this same install — expo_push_token is globally unique per install) so the
    -- device_id upsert below can take that token without tripping
    -- devices_expo_push_token_key. Runs AFTER adopt, so a row this call just adopted
    -- (now carrying v_device_id) is preserved; only foreign/legacy token-holders go.
    delete from public.devices
      where expo_push_token = p->>'expo_push_token'
        and device_id is distinct from v_device_id;

    insert into public.devices (
      expo_push_token, device_id, district_id, district_name, country_name,
      timezone, locale, sound, enabled_prayers, reminder_minutes,
      platform, battery_exempt, last_seen_at, updated_at
    ) values (
      p->>'expo_push_token', v_device_id, p->>'district_id', p->>'district_name',
      p->>'country_name', p->>'timezone', p->>'locale', p->>'sound',
      (select array(select jsonb_array_elements_text(p->'enabled_prayers'))),
      coalesce((p->>'reminder_minutes')::int, 0),
      nullif(p->>'platform','')::text,
      (p->>'battery_exempt')::boolean,
      now(), now()
    )
    on conflict (device_id) where device_id is not null do update set
      expo_push_token = excluded.expo_push_token,
      district_id = excluded.district_id,
      district_name = excluded.district_name,
      country_name = excluded.country_name,
      timezone = excluded.timezone,
      locale = excluded.locale,
      sound = excluded.sound,
      enabled_prayers = excluded.enabled_prayers,
      reminder_minutes = excluded.reminder_minutes,
      platform = coalesce(excluded.platform, public.devices.platform),
      battery_exempt = coalesce(excluded.battery_exempt, public.devices.battery_exempt),
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
    returning id into v_id;
  else
    insert into public.devices (
      expo_push_token, district_id, district_name, country_name,
      timezone, locale, sound, enabled_prayers, reminder_minutes,
      platform, battery_exempt, last_seen_at, updated_at
    ) values (
      p->>'expo_push_token', p->>'district_id', p->>'district_name',
      p->>'country_name', p->>'timezone', p->>'locale', p->>'sound',
      (select array(select jsonb_array_elements_text(p->'enabled_prayers'))),
      coalesce((p->>'reminder_minutes')::int, 0),
      nullif(p->>'platform','')::text,
      (p->>'battery_exempt')::boolean,
      now(), now()
    )
    on conflict (expo_push_token) do update set
      district_id = excluded.district_id,
      district_name = excluded.district_name,
      country_name = excluded.country_name,
      timezone = excluded.timezone,
      locale = excluded.locale,
      sound = excluded.sound,
      enabled_prayers = excluded.enabled_prayers,
      reminder_minutes = excluded.reminder_minutes,
      platform = coalesce(excluded.platform, public.devices.platform),
      battery_exempt = coalesce(excluded.battery_exempt, public.devices.battery_exempt),
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.upsert_device(jsonb) from public, anon;
grant execute on function public.upsert_device(jsonb) to service_role;
