import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import type { PrayerTime, ScheduledPrayer, YearlyPrayerCache } from './types';

import {
  ALL_PRAYERS_COUNT,
  ANDROID_CHANNEL_FAJR_ID,
  ANDROID_CHANNEL_FAJR_NAME,
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_NAME,
  ANDROID_CHANNEL_REGULAR_ID,
  ANDROID_CHANNEL_REGULAR_NAME,
  DEFAULT_SOUND,
  PENDING_NOTIFICATION_HARD_CAP,
  ROLLING_WINDOW_DAYS,
  ROLLING_WINDOW_DAYS_ALL_PRAYERS,
  SOUND_FILES,
  type SoundKey,
  adhanPlaybackBackend,
  buildNotificationId,
  channelIdForPrayer,
  isPrayerNotificationId,
  soundForPrayer,
} from '@/constants/notifications';
import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { i18n } from '@/locales/i18n';
import { armPrayers, cancelAll as cancelNativeAdhan } from '@/modules/adhan-player';
import { useUiStore } from '@/store/uiStore';
import { logger } from '@/utils/logger';
import { addLocalDays, getDateComponentsInTz, isoDateInTz, parsePrayerTime } from '@/utils/time';



type ReconcileOptions = {
  windowDays?: number;
  enabledPrayers?: PrayerKey[];
  sound?: SoundKey;
  districtName?: string;
};

type TargetComputation = {
  targets: ScheduledPrayer[];
  parseAttempted: number;
  parseSkipped: number;
};

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: DEFAULT_SOUND,
    vibrationPattern: [0, 500, 250, 500],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  // Android freezes a channel's sound at first registration, so each adhan
  // recording needs its own channel: the scheduler routes imsak to the fajr
  // channel and every other prayer to the regular one.
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_FAJR_ID, {
    name: ANDROID_CHANNEL_FAJR_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: SOUND_FILES.fajr,
    vibrationPattern: [0, 500, 250, 500],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_REGULAR_ID, {
    name: ANDROID_CHANNEL_REGULAR_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: SOUND_FILES.regular,
    vibrationPattern: [0, 500, 250, 500],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// Serialize reconcile passes. reconcile is reached from the lifecycle sync, the
// prayer-toggle path, and the city-change reset; two concurrent passes dispatch
// schedule/cancel for the same notification ids onto the single notification store +
// AlarmManager and surface spurious rejections → a false 'partial-schedule' banner.
// Chaining (run after the predecessor settles) — not collapsing — keeps correctness
// when a later pass carries different enabledPrayers/cache. The returned promise still
// rejects to its own caller on a real failure; only the internal chain link swallows,
// so one failure cannot poison the next pass.
let reconcileChain: Promise<unknown> = Promise.resolve();
const ANDROID_NOTIFICATION_MUTATION_CONCURRENCY = 1;
const DEFAULT_NOTIFICATION_MUTATION_CONCURRENCY = 4;

export function reconcile(
  cache: YearlyPrayerCache,
  options: ReconcileOptions = {},
): Promise<{ scheduled: number; cancelled: number; failed: number; total: number }> {
  const run = reconcileChain.then(() => reconcileInner(cache, options));
  reconcileChain = run.catch(() => undefined);
  return run;
}

async function allSettledBounded<T>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<PromiseSettledResult<void>[]> {
  if (items.length === 0) return [];

  const results: PromiseSettledResult<void>[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await run(items[index]!);
        results[index] = { status: 'fulfilled', value: undefined };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function reconcileInner(
  cache: YearlyPrayerCache,
  options: ReconcileOptions = {},
): Promise<{ scheduled: number; cancelled: number; failed: number; total: number }> {
  const enabled = options.enabledPrayers ?? [...PRAYER_KEYS];
  // All-six prayers default to an 8-day window so 6 × 8 = 48 stays under
  // the iOS pending cap. An explicit windowDays override is honored, but
  // the slice() below is the absolute backstop against silent over-cap.
  const defaultWindow =
    enabled.length === ALL_PRAYERS_COUNT
      ? ROLLING_WINDOW_DAYS_ALL_PRAYERS
      : ROLLING_WINDOW_DAYS;
  const windowDays = options.windowDays ?? defaultWindow;
  const soundPref: SoundKey = options.sound ?? 'default';
  const tz = cache.timezone;
  const now = new Date();

  const computed = computeTargetsWithStats(cache, tz, now, windowDays, enabled);
  const target = computed.targets.slice(
    0,
    PENDING_NOTIFICATION_HARD_CAP,
  );
  if (
    computed.parseAttempted > 0 &&
    (computed.parseAttempted - computed.parseSkipped) / computed.parseAttempted < 0.8
  ) {
    useUiStore.getState().setError({
      code: 'parse-skipped',
      data: { skipped: computed.parseSkipped, total: computed.parseAttempted },
    });
  }

  // Android + adhan-on routes the 5 adhan prayers to the native full-adhan
  // player (AlarmManager + foreground service); gunes, iOS, and the
  // default-sound path stay on expo-notifications (committed <=30s clips).
  const platform = Platform.OS === 'android' ? 'android' : 'ios';
  const nativeTargets = target.filter(
    (t) => adhanPlaybackBackend(t.prayerKey, platform, soundPref) === 'native',
  );
  const expoTargets = target.filter(
    (t) => adhanPlaybackBackend(t.prayerKey, platform, soundPref) === 'expo',
  );

  try {
    if (platform === 'android' && soundPref !== DEFAULT_SOUND) {
      // Full replace; the Kotlin side clears prior alarms before re-arming, so
      // this stays idempotent like the expo pending-diff below.
      await armPrayers(
        nativeTargets.map((t) => ({
          id: t.id,
          prayerKey: t.prayerKey,
          fireAtEpochMs: t.fireAt.getTime(),
          soundKind: t.prayerKey === 'imsak' ? 'fajr' : 'regular',
          title: i18n.t(`prayer.${t.prayerKey}.title`),
          body: options.districtName
            ? i18n.t(`prayer.${t.prayerKey}.bodyWithCity`, { city: options.districtName })
            : i18n.t(`prayer.${t.prayerKey}.body`),
        })),
      );
    } else {
      // Pref turned off or not Android → clear any native alarms so a previously
      // armed adhan never fires after the user opted out / switched platforms.
      await cancelNativeAdhan();
    }
  } catch (e) {
    // Isolate the native bridge like the expo schedule/cancel passes below: a
    // rejected arm/cancel must not abort reconcile (which would also drop the
    // gunes expo schedule + the stale-cancel pass). Surface, never swallow.
    logger.warn('native-adhan-failed', { error: String(e) });
    useUiStore.getState().setError({ code: 'native-arm-failed' });
  }

  const pendingAll = await Notifications.getAllScheduledNotificationsAsync();
  const pendingPrayer = pendingAll.filter((n) => isPrayerNotificationId(n.identifier));
  const pendingMap = new Map(pendingPrayer.map((n) => [n.identifier, n]));
  const targetMap = new Map(expoTargets.map((s) => [s.id, s]));

  const toCancel = pendingPrayer.filter((p) => !targetMap.has(p.identifier));
  const toSchedule = expoTargets.filter((s) => !pendingMap.has(s.id));
  const mutationConcurrency =
    platform === 'android'
      ? ANDROID_NOTIFICATION_MUTATION_CONCURRENCY
      : DEFAULT_NOTIFICATION_MUTATION_CONCURRENCY;

  // Mirror the schedule pass below: a native crash cancelling one stale
  // notification must not block the rest, otherwise a single corrupted
  // pending entry permanently breaks reconcile until the user reinstalls.
  const cancelResults = await allSettledBounded(
    toCancel,
    mutationConcurrency,
    (c) => Notifications.cancelScheduledNotificationAsync(c.identifier),
  );
  const cancelFailed = cancelResults.filter((r) => r.status === 'rejected').length;
  if (cancelFailed > 0) {
    logger.warn('reconcile-cancel-partial-failure', {
      failed: cancelFailed,
      total: toCancel.length,
    });
  }

  const results = await allSettledBounded(
    toSchedule,
    mutationConcurrency,
    (s) => scheduleOne(s, tz, soundPref, options.districtName),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  const scheduled = toSchedule.length - failed;

  if (failed > 0 || cancelFailed > 0) {
    logger.warn('reconcile-partial-failure', {
      failed,
      total: toSchedule.length,
      cancelFailed,
    });
    useUiStore.getState().setError({
      code: 'partial-schedule',
      data: { failed, total: toSchedule.length, cancelFailed },
    });
  } else if (useUiStore.getState().lastError?.code === 'partial-schedule') {
    useUiStore.getState().setError(null);
  }

  logger.info('reconcile', {
    target: target.length,
    cancelled: toCancel.length - cancelFailed,
    scheduled,
    failed,
  });

  return { scheduled, cancelled: toCancel.length, failed, total: target.length };
}

// Hard reset for a city change: cancel EVERY pending notification WITHOUT
// enumerating. cancelAllPrayerNotifications() below depends on
// getAllScheduledNotificationsAsync() returning every prior request AND on
// isPrayerNotificationId() recognizing each one — guarantees that don't always
// hold on device (cross-session enumeration, id-scheme drift across updates),
// which let a previous city's notifications survive a switch and fire alongside
// the new one. cancelAllScheduledNotificationsAsync() clears them in one call,
// no enumeration. The app only ever schedules prayer notifications, so
// "cancel all" == "cancel all adhan notifications" (safe). Native alarms too
// (rules/00 S4: "Şehir değiştirme → tüm pending iptal → yeniden zamanla").
export async function resetAllScheduledNotifications(): Promise<void> {
  await cancelNativeAdhan();
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function cancelAllPrayerNotifications(): Promise<void> {
  // Clear native adhan alarms too (no-op on iOS / when none armed). Otherwise
  // "delete my data" and city resets — which call this without a trailing
  // reconcile — leave the AlarmManager alarms + persisted schedule intact, so
  // the full adhan keeps firing (and re-arms across reboot) after the user
  // opted out. (Review C1)
  await cancelNativeAdhan();
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    if (isPrayerNotificationId(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

export function computeTargets(
  cache: YearlyPrayerCache,
  tz: string,
  now: Date,
  windowDays: number,
  enabled: PrayerKey[],
): ScheduledPrayer[] {
  return computeTargetsWithStats(cache, tz, now, windowDays, enabled).targets;
}

function computeTargetsWithStats(
  cache: YearlyPrayerCache,
  tz: string,
  now: Date,
  windowDays: number,
  enabled: PrayerKey[],
): TargetComputation {
  const out: ScheduledPrayer[] = [];
  let parseAttempted = 0;
  let parseSkipped = 0;
  const todayIso = isoDateInTz(now, tz);
  for (let d = 0; d < windowDays; d++) {
    const dateIso = addLocalDays(todayIso, d);
    const entry = findEntryForDate(cache.entries, dateIso);
    if (!entry) continue;
    for (const key of enabled) {
      const value = entry.times?.[key];
      if (!value) continue;
      parseAttempted++;
      try {
        const fireAt = parsePrayerTime(value, dateIso, tz);
        if (fireAt.getTime() <= now.getTime()) continue;
        out.push({
          id: buildNotificationId(cache.districtId, dateIso, key, tz, fireAt.toISOString()),
          prayerKey: key,
          dateIso,
          fireAt,
        });
      } catch (e) {
        // A single malformed entry must not abort the whole window.
        parseSkipped++;
        logger.warn('parsePrayerTime-failed', { dateIso, key, value, error: String(e) });
      }
    }
  }
  return { targets: out, parseAttempted, parseSkipped };
}

function findEntryForDate(entries: PrayerTime[], dateIso: string): PrayerTime | undefined {
  return entries.find((e) => e.date.startsWith(dateIso));
}

async function scheduleOne(
  s: ScheduledPrayer,
  tz: string,
  soundPref: SoundKey,
  districtName?: string,
): Promise<void> {
  const c = getDateComponentsInTz(s.fireAt, tz);
  await Notifications.scheduleNotificationAsync({
    identifier: s.id,
    content: {
      title: i18n.t(`prayer.${s.prayerKey}.title`),
      body: districtName
        ? i18n.t(`prayer.${s.prayerKey}.bodyWithCity`, { city: districtName })
        : i18n.t(`prayer.${s.prayerKey}.body`),
      sound: soundForPrayer(s.prayerKey, soundPref),
      data: {
        prayerKey: s.prayerKey,
        dateIso: s.dateIso,
        timezone: tz,
        fireAt: s.fireAt.toISOString(),
      },
    },
    trigger: {
      type: SchedulableTriggerInputTypes.CALENDAR,
      timezone: tz,
      year: c.year,
      month: c.month,
      day: c.day,
      hour: c.hour,
      minute: c.minute,
      second: 0,
      repeats: false,
      ...(Platform.OS === 'android'
        ? { channelId: channelIdForPrayer(s.prayerKey, soundPref) }
        : {}),
    },
  });
}

export async function setupForegroundHandler(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowList: true,
    }),
  });
}
