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
  const p = {
    expo_push_token: payload.expoPushToken,
    device_id: payload.deviceId ?? null,
    district_id: payload.districtId,
    district_name: payload.districtName,
    country_name: payload.countryName,
    timezone: payload.timezone,
    locale: payload.locale,
    sound: payload.sound,
    enabled_prayers: payload.enabledPrayers,
    reminder_minutes: payload.reminderMinutes,
    platform: payload.platform ?? null,
    battery_exempt: payload.batteryExempt ?? null,
  };

  const { data, error } = await supabase.rpc('upsert_device', { p });
  if (error || !data) return { error: error?.message ?? 'unknown' };
  return { id: data as string };
}

Deno.serve((req) =>
  handleRegisterDevice(req, {
    rateLimit,
    upsertDevice,
    hmacSecret: HMAC_SECRET,
    now: () => new Date(),
  }),
);
