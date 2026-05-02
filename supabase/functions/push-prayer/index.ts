import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const EXPO_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');
const STALE_DAYS = 5;
const PRAYER_KEYS = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'] as const;

type Device = {
  id: string;
  expo_push_token: string;
  district_id: string;
  district_name: string;
  timezone: string;
  locale: string;
  sound: string;
  enabled_prayers: string[];
};

type PrayerEntry = {
  date: string;
  imsak: string;
  gunes: string;
  ogle: string;
  ikindi: string;
  aksam: string;
  yatsi: string;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound?: string | null;
  data?: Record<string, unknown>;
};

Deno.serve(async () => {
  try {
    const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
    const { data: devices, error } = await supabase
      .from('devices')
      .select('*')
      .lt('last_seen_at', cutoff);

    if (error) throw error;
    if (!devices || devices.length === 0) {
      return jsonResponse({ sent: 0, reason: 'no_stale_devices' });
    }

    const messages: ExpoMessage[] = [];
    const logs: Array<{ device_id: string; prayer_key: string; scheduled_for: string }> = [];

    for (const dev of devices as Device[]) {
      try {
        const cache = await ensurePrayerCache(dev.district_id);
        const todayInTz = formatInTz(new Date(), dev.timezone, 'yyyy-MM-dd');
        const entry = cache.find((e) => e.date.startsWith(todayInTz));
        if (!entry) continue;
        const minuteInTz = formatInTz(new Date(), dev.timezone, 'HH:mm');
        for (const key of PRAYER_KEYS) {
          if (!dev.enabled_prayers.includes(key)) continue;
          if (entry[key] !== minuteInTz) continue;
          messages.push({
            to: dev.expo_push_token,
            title: titleFor(key, dev.locale),
            body: bodyFor(key, dev.district_name, dev.locale),
            sound: dev.sound === 'default' ? 'default' : null,
            data: { prayerKey: key, source: 'server' },
          });
          logs.push({
            device_id: dev.id,
            prayer_key: key,
            scheduled_for: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error('device loop error', dev.id, e);
      }
    }

    if (messages.length === 0) return jsonResponse({ sent: 0 });

    const chunks = chunk(messages, 100);
    for (const c of chunks) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (EXPO_TOKEN) headers.Authorization = `Bearer ${EXPO_TOKEN}`;
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(c),
      });
    }
    if (logs.length > 0) await supabase.from('push_log').insert(logs);

    return jsonResponse({ sent: messages.length });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

async function ensurePrayerCache(districtId: string): Promise<PrayerEntry[]> {
  const { data: row } = await supabase
    .from('prayer_cache')
    .select('*')
    .eq('district_id', districtId)
    .maybeSingle();
  const now = new Date();
  const TTL_MS = 30 * 86400_000;
  if (
    row &&
    row.year === now.getUTCFullYear() &&
    Date.now() - new Date(row.fetched_at).getTime() < TTL_MS
  ) {
    return row.data as PrayerEntry[];
  }
  const res = await fetch(`https://ezanvakti.imsakiyem.com/api/prayer-times/${districtId}/yearly`);
  const json = (await res.json()) as { data: PrayerEntry[] };
  await supabase.from('prayer_cache').upsert({
    district_id: districtId,
    year: now.getUTCFullYear(),
    data: json.data,
    fetched_at: now.toISOString(),
  });
  return json.data;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function formatInTz(d: Date, tz: string, pattern: 'yyyy-MM-dd' | 'HH:mm'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00';
  if (pattern === 'yyyy-MM-dd') return `${get('year')}-${get('month')}-${get('day')}`;
  const hh = get('hour') === '24' ? '00' : get('hour');
  return `${hh}:${get('minute')}`;
}

const TR_TITLES: Record<string, string> = {
  imsak: 'İmsak',
  gunes: 'Güneş',
  ogle: 'Öğle',
  ikindi: 'İkindi',
  aksam: 'Akşam',
  yatsi: 'Yatsı',
};
const EN_TITLES: Record<string, string> = {
  imsak: 'Fajr',
  gunes: 'Sunrise',
  ogle: 'Dhuhr',
  ikindi: 'Asr',
  aksam: 'Maghrib',
  yatsi: 'Isha',
};

function titleFor(key: string, locale: string): string {
  return locale === 'en' ? (EN_TITLES[key] ?? key) : (TR_TITLES[key] ?? key);
}

function bodyFor(key: string, city: string, locale: string): string {
  if (locale === 'en') {
    if (key === 'gunes') return `Sun has risen in ${city}.`;
    return `${EN_TITLES[key] ?? key} time has started in ${city}.`;
  }
  if (key === 'gunes') return `${city} için güneş doğdu.`;
  return `${city} için ${TR_TITLES[key] ?? key.toLowerCase()} vakti girdi.`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
