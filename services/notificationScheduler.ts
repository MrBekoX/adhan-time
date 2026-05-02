import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import type { PrayerTime, ScheduledPrayer, YearlyPrayerCache } from './types';

import {
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_NAME,
  ROLLING_WINDOW_DAYS,
  buildNotificationId,
  isPrayerNotificationId,
} from '@/constants/notifications';
import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { i18n } from '@/locales/i18n';
import { logger } from '@/utils/logger';
import { addDays, getDateComponentsInTz, isoDateInTz, parsePrayerTime } from '@/utils/time';



type ReconcileOptions = {
  windowDays?: number;
  enabledPrayers?: PrayerKey[];
  sound?: string;
  districtName?: string;
};

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 500, 250, 500],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function reconcile(
  cache: YearlyPrayerCache,
  options: ReconcileOptions = {},
): Promise<{ scheduled: number; cancelled: number; total: number }> {
  const windowDays = options.windowDays ?? ROLLING_WINDOW_DAYS;
  const enabled = options.enabledPrayers ?? [...PRAYER_KEYS];
  const sound = options.sound ?? 'default';
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
  for (const s of toSchedule) {
    await scheduleOne(s, tz, sound, options.districtName);
  }

  logger.info('reconcile', {
    target: target.length,
    cancelled: toCancel.length,
    scheduled: toSchedule.length,
  });

  return { scheduled: toSchedule.length, cancelled: toCancel.length, total: target.length };
}

export async function cancelAllPrayerNotifications(): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    if (isPrayerNotificationId(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

function computeTargets(
  cache: YearlyPrayerCache,
  tz: string,
  now: Date,
  windowDays: number,
  enabled: PrayerKey[],
): ScheduledPrayer[] {
  const out: ScheduledPrayer[] = [];
  for (let d = 0; d < windowDays; d++) {
    const dayDate = addDays(now, d);
    const dateIso = isoDateInTz(dayDate, tz);
    const entry = findEntryForDate(cache.entries, dateIso);
    if (!entry) continue;
    for (const key of enabled) {
      const value = entry[key];
      if (!value) continue;
      const fireAt = parsePrayerTime(value, dateIso, tz);
      if (fireAt.getTime() <= now.getTime()) continue;
      out.push({
        id: buildNotificationId(cache.districtId, dateIso, key),
        prayerKey: key,
        dateIso,
        fireAt,
      });
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
  sound: string,
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
      sound: sound === 'default' ? 'default' : sound,
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
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
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
