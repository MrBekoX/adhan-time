import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createSupabaseRateLimitClient } from '../_shared/rate-limit.ts';

import { handleUnregisterDevice } from './handler.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const HMAC_SECRET = Deno.env.get('REGISTER_HMAC_KEY') ?? null;
const rateLimit = createSupabaseRateLimitClient(supabase);

Deno.serve((req) =>
  handleUnregisterDevice(req, {
    rateLimit,
    deleteByTokenAndDeviceId: async (token, deviceId) => {
      const { error } = await supabase
        .from('devices')
        .delete()
        .eq('expo_push_token', token)
        .eq('device_id', deviceId);
      if (error) throw error;
    },
    hmacSecret: HMAC_SECRET,
    now: () => new Date(),
  }),
);
