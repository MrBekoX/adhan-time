import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { verifyCronSecret } from '../_shared/cron-auth.ts';
import {
  formatInTz,
  isWithinPrayerWindow,
  localYearInTz,
} from '../_shared/push-window.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const EXPO_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');
// S2: shared secret with pg_cron — fail closed when unset so the function
// never accidentally exposes a public POST endpoint after a redeploy.
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? null;
const STALE_DAYS = 5;
const PRAYER_KEYS = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'] as const;
type PrayerKey = (typeof PRAYER_KEYS)[number];

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
  times: Record<PrayerKey, string>;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound?: string | null;
  data?: Record<string, unknown>;
};

type PushLogRow = {
  device_id: string;
  prayer_key: string;
  scheduled_for: string;
  local_date: string;
};

Deno.serve(async (req: Request) => {
  if (!verifyCronSecret(req, CRON_SECRET)) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }
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

    const now = new Date();
    const messages: ExpoMessage[] = [];
    const logs: PushLogRow[] = [];

    for (const dev of devices as Device[]) {
      try {
        const tz = dev.timezone;
        const todayInTz = formatInTz(now, tz, 'yyyy-MM-dd');
        const yearInTz = localYearInTz(now, tz);
        const cache = await ensurePrayerCache(dev.district_id, yearInTz);
        const entry = cache.find((e) => e.date.startsWith(todayInTz));
        if (!entry) continue;

        for (const key of PRAYER_KEYS) {
          if (!dev.enabled_prayers.includes(key)) continue;
          const localTime = entry.times?.[key];
          if (!localTime) continue;
          if (!isWithinPrayerWindow(todayInTz, localTime, tz, now)) continue;

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
            scheduled_for: now.toISOString(),
            local_date: todayInTz,
          });
        }
      } catch (e) {
        console.error('device loop error', dev.id, e);
      }
    }

    if (messages.length === 0) return jsonResponse({ sent: 0 });

    for (const c of chunk(messages, 100)) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (EXPO_TOKEN) headers.Authorization = `Bearer ${EXPO_TOKEN}`;
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(c),
      });
    }
    if (logs.length > 0) {
      // V12: dedup at the DB layer — second insert for the same
      // (device_id, prayer_key, local_date) tuple is silently dropped.
      await supabase
        .from('push_log')
        .upsert(logs, { onConflict: 'device_id,prayer_key,local_date', ignoreDuplicates: true });
    }

    return jsonResponse({ sent: messages.length });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

async function ensurePrayerCache(districtId: string, year: number): Promise<PrayerEntry[]> {
  // V13: composite (district_id, year) lookup so the same district can hold
  // data for both the current and the rolling-window-next year.
  const { data: row } = await supabase
    .from('prayer_cache')
    .select('*')
    .eq('district_id', districtId)
    .eq('year', year)
    .maybeSingle();
  const TTL_MS = 30 * 86400_000;
  if (row && Date.now() - new Date(row.fetched_at).getTime() < TTL_MS) {
    return row.data as PrayerEntry[];
  }

  const res = await fetch(
    `https://ezanvakti.imsakiyem.com/api/prayer-times/${districtId}/yearly`,
  );
  if (!res.ok) throw new Error(`upstream-${res.status}`);
  const json = (await res.json()) as { success?: boolean; data?: PrayerEntry[] };
  if (!json?.success || !Array.isArray(json.data)) throw new Error('bad-envelope');

  await supabase.from('prayer_cache').upsert(
    {
      district_id: districtId,
      year,
      data: json.data,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'district_id,year' },
  );
  return json.data;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
const AR_TITLES: Record<string, string> = {
  imsak: 'الفجر',
  gunes: 'الشروق',
  ogle: 'الظهر',
  ikindi: 'العصر',
  aksam: 'المغرب',
  yatsi: 'العشاء',
};
const ZH_TITLES: Record<string, string> = {
  imsak: '晨礼',
  gunes: '日出',
  ogle: '晌礼',
  ikindi: '晡礼',
  aksam: '昏礼',
  yatsi: '宵礼',
};

function titleFor(key: string, locale: string): string {
  switch (locale) {
    case 'en':
      return EN_TITLES[key] ?? key;
    case 'ar':
      return AR_TITLES[key] ?? key;
    case 'zh':
      return ZH_TITLES[key] ?? key;
    default:
      return TR_TITLES[key] ?? key;
  }
}

function bodyFor(key: string, city: string, locale: string): string {
  if (locale === 'en') {
    if (key === 'gunes') return `Sun has risen in ${city}.`;
    return `${EN_TITLES[key] ?? key} time has started in ${city}.`;
  }
  if (locale === 'ar') {
    if (key === 'gunes') return `أشرقت الشمس في ${city}.`;
    return `دخل وقت ${AR_TITLES[key] ?? key} في ${city}.`;
  }
  if (locale === 'zh') {
    if (key === 'gunes') return `${city} 太阳已升起。`;
    return `${city} ${ZH_TITLES[key] ?? key}时间已到。`;
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
