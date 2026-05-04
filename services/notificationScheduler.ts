import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import type { PrayerTime, ScheduledPrayer, YearlyPrayerCache } from './types';

import {
  ANDROID_CHANNEL_CUSTOM_ID,
  ANDROID_CHANNEL_CUSTOM_NAME,
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_NAME,
  ROLLING_WINDOW_DAYS,
  SOUNDS,
  type SoundKey,
  buildNotificationId,
  channelIdForSound,
  isPrayerNotificationId,
} from '@/constants/notifications';
import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { i18n } from '@/locales/i18n';
import { useUiStore } from '@/store/uiStore';
import { logger } from '@/utils/logger';
import { addLocalDays, getDateComponentsInTz, isoDateInTz, parsePrayerTime } from '@/utils/time';



type ReconcileOptions = {
  windowDays?: number;
  enabledPrayers?: PrayerKey[];
  sound?: SoundKey;
  districtName?: string;
};

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: SOUNDS.default,
    vibrationPattern: [0, 500, 250, 500],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  // V8: a separate channel hosts the custom adhan ringtone — runtime sound
  // changes on Android require swapping channel IDs, since the OS freezes a
  // channel's sound at first registration.
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_CUSTOM_ID, {
    name: ANDROID_CHANNEL_CUSTOM_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: SOUNDS.adhanShort,
    vibrationPattern: [0, 500, 250, 500],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function reconcile(
  cache: YearlyPrayerCache,
  options: ReconcileOptions = {},
): Promise<{ scheduled: number; cancelled: number; failed: number; total: number }> {
  const windowDays = options.windowDays ?? ROLLING_WINDOW_DAYS;
  const enabled = options.enabledPrayers ?? [...PRAYER_KEYS];
  const soundKey: SoundKey = options.sound ?? 'default';
  const tz = cache.timezone;
  const now = new Date();

  const target = computeTargets(cache, tz, now, windowDays, enabled);

  const pendingAll = await Notifications.getAllScheduledNotificationsAsync();
  const pendingPrayer = pendingAll.filter((n) => isPrayerNotificationId(n.identifier));
  const pendingMap = new Map(pendingPrayer.map((n) => [n.identifier, n]));
  const targetMap = new Map(target.map((s) => [s.id, s]));

  const toCancel = pendingPrayer.filter((p) => !targetMap.has(p.identifier));
  const toSchedule = target.filter((s) => !pendingMap.has(s.id));

  for (const c of toCancel) {
    await Notifications.cancelScheduledNotificationAsync(c.identifier);
  }

  // F2: schedule each target independently — one rejection must not abort the rest.
  const results = await Promise.allSettled(
    toSchedule.map((s) => scheduleOne(s, tz, soundKey, options.districtName)),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  const scheduled = toSchedule.length - failed;

  if (failed > 0) {
    logger.warn('reconcile-partial-failure', { failed, total: toSchedule.length });
    useUiStore.getState().setError({
      code: 'partial-schedule',
      data: { failed, total: toSchedule.length },
    });
  }

  logger.info('reconcile', {
    target: target.length,
    cancelled: toCancel.length,
    scheduled,
    failed,
  });

  return { scheduled, cancelled: toCancel.length, failed, total: target.length };
}

export async function cancelAllPrayerNotifications(): Promise<void> {
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
  const out: ScheduledPrayer[] = [];
  const todayIso = isoDateInTz(now, tz);
  for (let d = 0; d < windowDays; d++) {
    const dateIso = addLocalDays(todayIso, d);
    const entry = findEntryForDate(cache.entries, dateIso);
    if (!entry) continue;
    for (const key of enabled) {
      const value = entry.times?.[key];
      if (!value) continue;
      try {
        const fireAt = parsePrayerTime(value, dateIso, tz);
        if (fireAt.getTime() <= now.getTime()) continue;
        out.push({
          id: buildNotificationId(cache.districtId, dateIso, key),
          prayerKey: key,
          dateIso,
          fireAt,
        });
      } catch (e) {
        // V11: a single malformed entry must not abort the whole window.
        logger.warn('parsePrayerTime-failed', { dateIso, key, value, error: String(e) });
      }
    }
  }
  return out;
}

function findEntryForDate(entries: PrayerTime[], dateIso: string): PrayerTime | undefined {
  return entries.find((e) => e.date.startsWith(dateIso));
}

async function scheduleOne(
  s: ScheduledPrayer,
  tz: string,
  soundKey: SoundKey,
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
      sound: SOUNDS[soundKey],
      data: { prayerKey: s.prayerKey, dateIso: s.dateIso },
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
      ...(Platform.OS === 'android' ? { channelId: channelIdForSound(soundKey) } : {}),
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
