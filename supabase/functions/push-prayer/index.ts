import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createAsyncDedupe } from '../_shared/async-dedupe.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import {
  buildDeviceErrorLog,
  filterPairsByReservedLogs,
  type ExpoMessage,
  type ExpoResponseBody,
  type Pair,
  type PushLogRow,
  type ReservedLogRow,
  processBatchResponse,
} from '../_shared/expo-push.ts';
import { prayerBody, prayerTitle } from '../_shared/i18n.ts';
import {
  fetchPrayerYear,
  isPrayerEntryArray,
  type PrayerEntry,
} from '../_shared/prayer-cache.ts';
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
// Shared secret with pg_cron — fail closed when unset so the function never
// accidentally exposes a public POST endpoint after a redeploy.
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? null;
const STALE_DAYS = 5;
const PRAYER_KEYS = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'] as const;
type PrayerKey = (typeof PRAYER_KEYS)[number];

// Per-prayer adhan sound routing — mirrors constants/notifications.ts on the
// app side (the RN/Deno boundary can't share a module, same as PRAYER_KEYS
// above). imsak = the dawn (sabah/fajr) adhan; every other prayer, including
// gunes, uses the regular adhan. iOS plays the file via `sound`; Android via
// the matching channel created by ensureAndroidChannel() on the device.
const SOUND_FAJR = 'adhan_fajr.wav';
const SOUND_REGULAR = 'adhan_regular.wav';
const CHANNEL_DEFAULT = 'adhan';
const CHANNEL_FAJR = 'adhan-fajr';
const CHANNEL_REGULAR = 'adhan-regular';

function pushSoundFor(pref: string, key: PrayerKey): string {
  if (pref === 'default') return 'default';
  return key === 'imsak' ? SOUND_FAJR : SOUND_REGULAR;
}

function pushChannelFor(pref: string, key: PrayerKey): string {
  if (pref === 'default') return CHANNEL_DEFAULT;
  return key === 'imsak' ? CHANNEL_FAJR : CHANNEL_REGULAR;
}

type Device = {
  id: string;
  expo_push_token: string;
  district_id: string;
  district_name: string;
  timezone: string;
  locale: string;
  sound: string;
  enabled_prayers: string[];
  rate_limited_until?: string | null;
};


Deno.serve(async (req: Request) => {
  if (!verifyCronSecret(req, CRON_SECRET)) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
    const { data: devices, error } = await supabase
      .from('devices')
      .select('*')
      .lt('last_seen_at', cutoff)
      .or(`rate_limited_until.is.null,rate_limited_until.lt.${nowIso}`);

    if (error) throw error;
    if (!devices || devices.length === 0) {
      return jsonResponse({ sent: 0, reason: 'no_stale_devices' });
    }

    const pairs: Pair[] = [];
    const deviceErrorLogs: PushLogRow[] = [];
    // One upstream yearly fetch per (district, year) per invocation, no matter
    // how many stale devices share a district (prevents an API stampede).
    const cacheDedupe = createAsyncDedupe<PrayerEntry[]>();

    for (const dev of devices as Device[]) {
      try {
        const tz = dev.timezone;
        const todayInTz = formatInTz(now, tz, 'yyyy-MM-dd');
        const yearInTz = localYearInTz(now, tz);
        const cache = await cacheDedupe(`${dev.district_id}:${yearInTz}`, () =>
          ensurePrayerCache(dev.district_id, yearInTz),
        );
        const entry = cache.find((e) => e.date.startsWith(todayInTz));
        if (!entry) continue;

        for (const key of PRAYER_KEYS) {
          if (!dev.enabled_prayers.includes(key)) continue;
          const localTime = entry.times?.[key];
          if (!localTime) continue;
          if (!isWithinPrayerWindow(todayInTz, localTime, tz, now)) continue;

          pairs.push({
            message: {
              to: dev.expo_push_token,
              title: prayerTitle(dev.locale, key),
              body: prayerBody(dev.locale, key, dev.district_name),
              sound: pushSoundFor(dev.sound, key),
              channelId: pushChannelFor(dev.sound, key),
              data: { prayerKey: key, source: 'server' },
            },
            log: {
              device_id: dev.id,
              prayer_key: key,
              scheduled_for: now.toISOString(),
              local_date: todayInTz,
            },
          });
        }
      } catch (e) {
        console.error('device loop error', dev.id, e);
        // Record an audit row so the (otherwise silent) failure shows up
        // in the push_log SQL view and ops can chase the bad device row.
        let localDate: string | undefined;
        try {
          localDate = formatInTz(now, dev.timezone, 'yyyy-MM-dd');
        } catch {
          // Bad tz is one of the loop-failure causes; UTC fallback is fine.
        }
        deviceErrorLogs.push(buildDeviceErrorLog(dev.id, now, e, localDate));
      }
    }

    if (pairs.length === 0) {
      // Even when nothing was sent, flush any per-device audit rows so a
      // silently-failing device doesn't disappear from push_log forever.
      await flushPushLogs(deviceErrorLogs);
      return jsonResponse({ sent: 0, deviceErrors: deviceErrorLogs.length });
    }

    // Reserve the dedup key before touching Expo. If the cron fires twice
    // inside the 60-second window, the second invocation sees no inserted
    // reservation row and skips the send entirely.
    const { data: reservedRows, error: reservationError } = await supabase
      .from('push_log')
      .upsert(
        pairs.map((p) => ({
          ...p.log,
          expo_response: { status: 'error', message: 'reserved-before-send' },
        })),
        {
          onConflict: 'device_id,prayer_key,local_date',
          ignoreDuplicates: true,
        },
      )
      .select('id,device_id,prayer_key,local_date');

    if (reservationError) throw reservationError;

    const reservedPairs = filterPairsByReservedLogs(
      pairs,
      (reservedRows ?? []) as ReservedLogRow[],
    );

    if (reservedPairs.length === 0) {
      await flushPushLogs(deviceErrorLogs);
      return jsonResponse({
        sent: 0,
        attempted: 0,
        candidates: pairs.length,
        duplicateSkipped: pairs.length,
        deviceErrors: deviceErrorLogs.length,
      });
    }

    const enrichedLogs: PushLogRow[] = [...deviceErrorLogs];
    const tokensToRemove = new Set<string>();
    const rateLimitedTokens = new Set<string>();
    let okCount = 0;

    for (const chunkPairs of chunk(reservedPairs, 100)) {
      const messages: ExpoMessage[] = chunkPairs.map((p) => p.message);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (EXPO_TOKEN) headers.Authorization = `Bearer ${EXPO_TOKEN}`;

      let response;
      try {
        response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers,
          body: JSON.stringify(messages),
        });
      } catch (e) {
        console.error('expo-send transport failed', e);
        for (const p of chunkPairs) {
          enrichedLogs.push({
            ...p.log,
            expo_response: { status: 'error', message: 'transport-failed' },
          });
        }
        continue;
      }

      let body: ExpoResponseBody | undefined;
      let bodyParseFailed = false;
      try {
        body = response.ok ? ((await response.json()) as ExpoResponseBody) : undefined;
      } catch (e) {
        console.error('expo-send body parse failed', e);
        bodyParseFailed = true;
      }

      // A 200 with a malformed body is not a success — fall through to the
      // !ok branch so each pair gets a recorded parse-failed log instead
      // of a fake "ok". DeviceNotRegistered cleanup defers to the next run
      // since we have no per-message tickets to inspect.
      const outcome = processBatchResponse(
        chunkPairs,
        response.ok && !bodyParseFailed
          ? { ok: true, body }
          : {
              ok: false,
              status: response.status,
              reason: bodyParseFailed ? 'body-parse-failed' : undefined,
            },
      );
      enrichedLogs.push(...outcome.enrichedLogs);
      for (const tok of outcome.tokensToRemove) tokensToRemove.add(tok);
      for (const tok of outcome.rateLimitedTokens) rateLimitedTokens.add(tok);
      for (const log of outcome.enrichedLogs) {
        const t = log.expo_response;
        if (t && t.status === 'ok') okCount++;
      }

      if (!response.ok) {
        console.error('expo-send non-2xx', { status: response.status });
      }
    }

    // Drop DeviceNotRegistered tokens so they stop getting retried every minute.
    if (tokensToRemove.size > 0) {
      await supabase
        .from('devices')
        .delete()
        .in('expo_push_token', Array.from(tokensToRemove));
      console.info('devices-removed', { count: tokensToRemove.size });
    }

    if (rateLimitedTokens.size > 0) {
      const cooldownUntil = new Date(Date.now() + 5 * 60_000).toISOString();
      await supabase
        .from('devices')
        .update({ rate_limited_until: cooldownUntil })
        .in('expo_push_token', Array.from(rateLimitedTokens));
      console.info('devices-rate-limited', {
        count: rateLimitedTokens.size,
        until: cooldownUntil,
      });
    }

    await flushPushLogs(enrichedLogs);

    return jsonResponse({
      sent: okCount,
      attempted: reservedPairs.length,
      candidates: pairs.length,
      duplicateSkipped: pairs.length - reservedPairs.length,
      removed: tokensToRemove.size,
      rateLimited: rateLimitedTokens.size,
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: String(e) }, 500);
  }
});

async function ensurePrayerCache(districtId: string, year: number): Promise<PrayerEntry[]> {
  // Composite (district_id, year) lookup so the same district can hold
  // data for both the current and the rolling-window-next year.
  const { data: row, error: selectError } = await supabase
    .from('prayer_cache')
    .select('*')
    .eq('district_id', districtId)
    .eq('year', year)
    .maybeSingle();
  if (selectError) throw selectError;
  const TTL_MS = 30 * 86400_000;
  if (
    row &&
    Date.now() - new Date(row.fetched_at).getTime() < TTL_MS &&
    isPrayerEntryArray(row.data)
  ) {
    return row.data as PrayerEntry[];
  }

  // Validate the upstream envelope BEFORE writing anything to cache:
  // a single bad upsert (e.g. an HTML 502 page) would otherwise silence
  // push notifications for the 30-day TTL window.
  const result = await fetchPrayerYear(fetch, districtId);
  if (!result.ok) throw new Error(result.reason);

  const { error: upsertError } = await supabase.from('prayer_cache').upsert(
    {
      district_id: districtId,
      year,
      data: result.data,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'district_id,year' },
  );
  if (upsertError) throw upsertError;
  return result.data;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function flushPushLogs(logs: PushLogRow[]): Promise<void> {
  for (const log of logs) {
    if (typeof log.id === 'number') {
      const { error } = await supabase
        .from('push_log')
        .update({ expo_response: log.expo_response })
        .eq('id', log.id);
      if (error) throw error;
    }
  }

  const inserts = logs.filter((log) => typeof log.id !== 'number');
  if (inserts.length === 0) return;

  const { error } = await supabase
    .from('push_log')
    .upsert(inserts, {
      onConflict: 'device_id,prayer_key,local_date',
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
