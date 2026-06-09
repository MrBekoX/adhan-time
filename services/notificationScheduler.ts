import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import type { PrayerTime, ScheduledPrayer, YearlyPrayerCache } from './types';

import {
  ALL_PRAYERS_COUNT,
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_NAME,
  ANDROID_CHANNEL_NOTIFICATION_ID,
  ANDROID_CHANNEL_NOTIFICATION_NAME,
  DEFAULT_SOUND,
  NOTIFICATION_SOUND_FILE,
  PENDING_NOTIFICATION_HARD_CAP,
  REMINDER_MAX_MINUTES,
  REMINDER_WINDOW_DAYS,
  ROLLING_WINDOW_DAYS,
  ROLLING_WINDOW_DAYS_ALL_PRAYERS,
  VIBRATION_PATTERN,
  type SoundKey,
  buildNotificationId,
  channelIdForPrayer,
  isPrayerNotificationId,
  soundForPrayer,
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
  // Minutes before each adhan to also schedule a "Yaklaşıyor / Coming up"
  // reminder (0 / undefined = off). See computeTargetsWithStats for the
  // adhan-first ordering that protects the iOS ≤50 cap.
  reminderMinutes?: number;
  // Re-register every target even if expo's store already lists it as pending.
  // A force-stop / aggressive-OEM kill cancels the AlarmManager alarms but leaves
  // expo-notifications' SharedPreferences records intact, so the normal diff sees
  // them as scheduled and re-registers nothing — alarms stay dead until the user
  // changes a setting. On a cold start we force a full re-schedule so the real
  // alarms are always restored (scheduleNotificationAsync overwrites by id).
  forceReschedule?: boolean;
};

type TargetComputation = {
  targets: ScheduledPrayer[];
  parseAttempted: number;
  parseSkipped: number;
};

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Remove the pre-pivot recitation channels so upgraded devices don't keep dead
  // entries (bound to the now-deleted adhan recordings) in Android notification
  // settings. No-op on fresh installs. Done before scheduling; reconcile reschedules
  // every prayer onto the channels below, so nothing is left pointing at these.
  await Notifications.deleteNotificationChannelAsync('adhan-fajr');
  await Notifications.deleteNotificationChannelAsync('adhan-regular');
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: DEFAULT_SOUND,
    vibrationPattern: VIBRATION_PATTERN,
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  // Android freezes a channel's sound at first registration, so the bundled
  // custom notification sound needs its own channel; the scheduler routes the
  // 'notification' preference here and the 'default' preference to the channel above.
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_NOTIFICATION_ID, {
    name: ANDROID_CHANNEL_NOTIFICATION_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    sound: NOTIFICATION_SOUND_FILE,
    vibrationPattern: VIBRATION_PATTERN,
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
  const soundPref: SoundKey = options.sound ?? 'default';
  // Clamp the persisted/option value at the point of use: setReminderMinutes
  // clamps on user action, but a rehydrated or out-of-range value (corruption,
  // a downgrade from a future build) would otherwise schedule reminders at an
  // arbitrary lead time with no guard.
  const reminderMinutes = Math.max(
    0,
    Math.min(REMINDER_MAX_MINUTES, Math.round(options.reminderMinutes ?? 0)),
  );
  // When reminders are on they double part of the queue, so reserve cap headroom
  // by shrinking the ADHAN window — otherwise 5 prayers × 10 days already fills
  // all 50 slots and every reminder is sliced off (silent no-op). Adhans stay
  // first in the target list (never dropped); this only trades a few days of
  // far-future adhan coverage — which the server fallback backstops — for the
  // near-term reminders the user explicitly asked for.
  let windowDays = options.windowDays ?? defaultWindow;
  if (reminderMinutes > 0 && enabled.length > 0) {
    const maxAdhanDays =
      Math.floor(PENDING_NOTIFICATION_HARD_CAP / enabled.length) - REMINDER_WINDOW_DAYS;
    windowDays = Math.min(windowDays, Math.max(REMINDER_WINDOW_DAYS, maxAdhanDays));
  }
  const tz = cache.timezone;
  const now = new Date();

  const computed = computeTargetsWithStats(cache, tz, now, windowDays, enabled, reminderMinutes);
  const target = computed.targets.slice(
    0,
    PENDING_NOTIFICATION_HARD_CAP,
  );
  // With the reminder budget above, targets should already fit; this stays as an
  // absolute backstop AND a canary so a future regression that over-fills the
  // queue is visible in logs instead of silently dropping notifications.
  if (computed.targets.length > PENDING_NOTIFICATION_HARD_CAP) {
    logger.warn('targets-exceeded-cap', {
      total: computed.targets.length,
      cap: PENDING_NOTIFICATION_HARD_CAP,
      enabled: enabled.length,
      windowDays,
      reminderMinutes,
    });
  }
  if (
    computed.parseAttempted > 0 &&
    (computed.parseAttempted - computed.parseSkipped) / computed.parseAttempted < 0.8
  ) {
    useUiStore.getState().setError({
      code: 'parse-skipped',
      data: { skipped: computed.parseSkipped, total: computed.parseAttempted },
    });
  }

  // Every prayer notification now goes through expo-notifications. (The native
  // full-adhan player was removed when the app switched from adhan recitation to
  // a bundled notification sound — see the 2026-06-04 design spec.)
  const platform = Platform.OS === 'android' ? 'android' : 'ios';

  const pendingAll = await Notifications.getAllScheduledNotificationsAsync();
  const pendingPrayer = pendingAll.filter((n) => isPrayerNotificationId(n.identifier));
  const pendingMap = new Map(pendingPrayer.map((n) => [n.identifier, n]));
  const targetMap = new Map(target.map((s) => [s.id, s]));

  const toCancel = pendingPrayer.filter((p) => !targetMap.has(p.identifier));
  const toSchedule = options.forceReschedule
    ? target
    : target.filter((s) => !pendingMap.has(s.id));
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
// "cancel all" == "cancel all prayer notifications" (safe)
// (rules/00 S4: "Şehir değiştirme → tüm pending iptal → yeniden zamanla").
export async function resetAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
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
  reminderMinutes = 0,
): ScheduledPrayer[] {
  return computeTargetsWithStats(cache, tz, now, windowDays, enabled, reminderMinutes).targets;
}

function computeTargetsWithStats(
  cache: YearlyPrayerCache,
  tz: string,
  now: Date,
  windowDays: number,
  enabled: PrayerKey[],
  reminderMinutes: number,
): TargetComputation {
  // Two passes collected separately so adhans can be returned BEFORE reminders:
  // reconcile slices the combined list to PENDING_NOTIFICATION_HARD_CAP, and
  // adhan-first ordering guarantees the cap drops reminders before any adhan
  // (the at-time prayer notification must never be silently lost — rules/04).
  const adhans: ScheduledPrayer[] = [];
  const reminders: ScheduledPrayer[] = [];
  let parseAttempted = 0;
  let parseSkipped = 0;
  // Index the ~365 yearly entries once (O(n)) instead of scanning per day
  // (O(n) × windowDays) inside the loop. First-wins to preserve the previous
  // entries.find() semantics if the API ever returns a duplicate date.
  const byDate = new Map<string, PrayerTime>();
  for (const e of cache.entries) {
    const key = e.date.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, e);
  }
  const todayIso = isoDateInTz(now, tz);
  for (let d = 0; d < windowDays; d++) {
    const dateIso = addLocalDays(todayIso, d);
    const entry = byDate.get(dateIso);
    if (!entry) continue;
    for (const key of enabled) {
      const value = entry.times?.[key];
      if (!value) continue;
      parseAttempted++;
      try {
        const fireAt = parsePrayerTime(value, dateIso, tz);
        if (fireAt.getTime() <= now.getTime()) continue;
        adhans.push({
          id: buildNotificationId(cache.districtId, dateIso, key, tz, fireAt.toISOString()),
          prayerKey: key,
          dateIso,
          fireAt,
        });
        // Reminder only for the nearest REMINDER_WINDOW_DAYS days (cap budget)
        // and only if its fire moment is still in the future.
        if (reminderMinutes > 0 && d < REMINDER_WINDOW_DAYS) {
          const reminderFireAt = new Date(fireAt.getTime() - reminderMinutes * 60_000);
          if (reminderFireAt.getTime() > now.getTime()) {
            reminders.push({
              id: buildNotificationId(
                cache.districtId,
                dateIso,
                key,
                tz,
                reminderFireAt.toISOString(),
                'reminder',
              ),
              prayerKey: key,
              dateIso,
              fireAt: reminderFireAt,
              kind: 'reminder',
              reminderMinutes,
            });
          }
        }
      } catch (e) {
        // A single malformed entry must not abort the whole window.
        parseSkipped++;
        logger.warn('parsePrayerTime-failed', { dateIso, key, value, error: String(e) });
      }
    }
  }
  return { targets: [...adhans, ...reminders], parseAttempted, parseSkipped };
}

async function scheduleOne(
  s: ScheduledPrayer,
  tz: string,
  soundPref: SoundKey,
  districtName?: string,
): Promise<void> {
  const isReminder = s.kind === 'reminder';
  const content = {
    title: isReminder ? i18n.t('prayer.reminder.title') : i18n.t(`prayer.${s.prayerKey}.title`),
    body: isReminder
      ? i18n.t('prayer.reminder.body', {
          prayer: i18n.t(`prayer.${s.prayerKey}.title`),
          minutes: s.reminderMinutes,
        })
      : districtName
        ? i18n.t(`prayer.${s.prayerKey}.bodyWithCity`, { city: districtName })
        : i18n.t(`prayer.${s.prayerKey}.body`),
    sound: soundForPrayer(soundPref),
    data: {
      prayerKey: s.prayerKey,
      dateIso: s.dateIso,
      timezone: tz,
      fireAt: s.fireAt.toISOString(),
      kind: s.kind ?? 'adhan',
    },
  };

  // expo-notifications' CALENDAR trigger is iOS-only: the Android native scheduler
  // REJECTS it ("Trigger of type: calendar is not supported on Android"), so every
  // Android schedule failed (confirmed on device: reconcile failed===total, ×12) and
  // raised the partial-schedule banner. s.fireAt is already an absolute, tz-correct
  // instant (parsePrayerTime → fromZonedTime with the district IANA tz), so a one-shot
  // DATE trigger fires at the right wall-clock moment and preserves DST without needing
  // Android calendar support. channelId carries the sound routing (default vs custom).
  if (Platform.OS === 'android') {
    await Notifications.scheduleNotificationAsync({
      identifier: s.id,
      content,
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: s.fireAt.getTime(),
        channelId: channelIdForPrayer(soundPref),
      },
    });
    return;
  }

  // iOS keeps the native UNCalendarNotificationTrigger (handles DST internally).
  const c = getDateComponentsInTz(s.fireAt, tz);
  await Notifications.scheduleNotificationAsync({
    identifier: s.id,
    content,
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
    },
  });
}

export async function setupForegroundHandler(): Promise<void> {
  Notifications.setNotificationHandler({
    // This handler runs ONLY for notifications that fire while the app is in the
    // foreground (background notifications are presented natively and never reach
    // here — rules/04). We let the OS play the channel sound (and vibration) so the
    // audible cue is reliable in EVERY app state — foreground, locked-foreground
    // (app open then screen off), and background. An earlier design suppressed the
    // foreground sound and replaced it with an in-app chime driven by a 1s JS timer;
    // that timer is suspended when the screen is off, so a prayer/reminder fired
    // while the app was open-then-locked arrived SILENTLY. Our handler returns
    // instantly, so expo's 3s-timeout drop never applies. The OS heads-up banner
    // stays suppressed because the in-app PrayerNowBanner owns the foreground visual
    // (no double banner); a silent shade entry is still kept via shouldShowList.
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
