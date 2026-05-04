import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { handleUnregisterDevice } from './handler.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve((req) =>
  handleUnregisterDevice(req, {
    deleteByToken: async (token) => {
      const { error } = await supabase.from('devices').delete().eq('expo_push_token', token);
      if (error) throw error;
    },
  }),
);
