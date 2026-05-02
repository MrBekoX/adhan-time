import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Body = {
  expoPushToken: string;
  districtId: string;
  districtName: string;
  countryName: string;
  timezone: string;
  locale: string;
  sound: string;
  enabledPrayers: string[];
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;
    if (!body.expoPushToken || !body.expoPushToken.startsWith('ExponentPushToken[')) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { data, error } = await supabase
      .from('devices')
      .upsert(
        {
          expo_push_token: body.expoPushToken,
          district_id: body.districtId,
          district_name: body.districtName,
          country_name: body.countryName,
          timezone: body.timezone,
          locale: body.locale,
          sound: body.sound,
          enabled_prayers: body.enabledPrayers,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'expo_push_token' },
      )
      .select('id')
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    return new Response(JSON.stringify({ id: data.id }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
