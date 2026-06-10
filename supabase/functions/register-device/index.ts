import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createSupabaseRateLimitClient } from '../_shared/rate-limit.ts';
import type { ValidPayload } from '../_shared/validators.ts';

import { handleRegisterDevice, type UpsertResult } from './handler.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const HMAC_SECRET = Deno.env.get('REGISTER_HMAC_KEY') ?? null;

const rateLimit = createSupabaseRateLimitClient(supabase);

async function upsertDevice(payload: ValidPayload): Promise<UpsertResult> {
  const row: Record<string, unknown> = {
    expo_push_token: payload.expoPushToken,
    district_id: payload.districtId,
    district_name: payload.districtName,
    country_name: payload.countryName,
    timezone: payload.timezone,
    locale: payload.locale,
    sound: payload.sound,
    enabled_prayers: payload.enabledPrayers,
    reminder_minutes: payload.reminderMinutes,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Only write the gating signals when the client actually reported them, so a
  // re-register from an older build (which omits them) can't clobber a value a
  // newer build already set.
  if (payload.platform !== undefined) row.platform = payload.platform;
  if (payload.batteryExempt !== undefined) row.battery_exempt = payload.batteryExempt;

  const { data, error } = await supabase
    .from('devices')
    .upsert(row, { onConflict: 'expo_push_token' })
    .select('id')
    .single();

  if (error || !data) return { error: error?.message ?? 'unknown' };
  return { id: data.id };
}

Deno.serve((req) =>
  handleRegisterDevice(req, {
    rateLimit,
    upsertDevice,
    hmacSecret: HMAC_SECRET,
    now: () => new Date(),
  }),
);
