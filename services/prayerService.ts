import { ezanvakti } from './ezanvaktiClient';
import {
  cancelAllPrayerNotifications,
  ensureAndroidChannel,
  reconcile,
  resetAllScheduledNotifications,
} from './notificationScheduler';
import { assertPrayerTimes } from './prayerValidation';
import type { PrayerTime, YearlyPrayerCache } from './types';

import { PRAYER_CACHE_TTL_MS } from '@/constants/api';
import { ROLLING_WINDOW_DAYS } from '@/constants/notifications';
import type { PrayerKey } from '@/constants/prayers';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { logger } from '@/utils/logger';
import { addLocalDays, isoDateInTz, yearInTz } from '@/utils/time';

export async function syncYearly(
  districtId: string,
  districtName: string,
  timezone: string,
  options: { force?: boolean; schedule?: boolean; forceReschedule?: boolean } = {},
): Promise<YearlyPrayerCache> {
  const force = options.force ?? false;
  const shouldSchedule = options.schedule ?? true;
  const forceReschedule = options.forceReschedule ?? false;
  const now = new Date();
  const localYear = yearInTz(now, timezone);
  const todayIso = isoDateInTz(now, timezone);
  const rollingEndIso = addLocalDays(todayIso, ROLLING_WINDOW_DAYS);
  const rollingEndYear = Number(rollingEndIso.slice(0, 4));

  const cached = usePrayerStore.getState().cache;
  const lastEntry = cached?.entries[cached.entries.length - 1];
  const cacheCovers =
    lastEntry !== undefined && lastEntry.date.slice(0, 10) >= rollingEndIso;

  if (
    !force &&
    cached &&
    cached.districtId === districtId &&
    cached.year === localYear &&
    cached.timezone === timezone &&
    cacheCovers &&
    Date.now() - new Date(cached.fetchedAt).getTime() < PRAYER_CACHE_TTL_MS
  ) {
    if (shouldSchedule) await scheduleAll(cached, districtName, forceReschedule);
    return cached;
  }

  logger.info('fetching yearly', { districtId, localYear });
  const entries = assertPrayerTimes(
    await ezanvakti.prayerTimesYearly(districtId),
    'yearly prayer sync',
  );

  if (rollingEndYear > localYear) {
    const nextYearStart = `${rollingEndYear}-01-01`;
    const nextYearEnd = addLocalDays(nextYearStart, 14);
    const extra = await fetchNextYearStart(districtId, nextYearStart, nextYearEnd);
    entries.push(...extra);
  }

  const fresh: YearlyPrayerCache = {
    districtId,
    year: localYear,
    fetchedAt: new Date().toISOString(),
    timezone,
    entries,
  };
  usePrayerStore.getState().setCache(fresh);
  if (shouldSchedule) await scheduleAll(fresh, districtName, forceReschedule);
  return fresh;
}

async function fetchNextYearStart(
  districtId: string,
  startDate: string,
  endDate: string,
): Promise<PrayerTime[]> {
  try {
    return assertPrayerTimes(
      await ezanvakti.prayerTimesRange(districtId, startDate, endDate),
      'range prayer sync',
    );
  } catch (e) {
    // Returning [] keeps the current-year cache writeable so the user isn't
    // left with nothing — but the rolling window can no longer cover the
    // year-boundary days. Use a distinct 'partial-sync' code (not
    // 'sync-failed') so useAppLifecycle's stale-banner cleanup at the end
    // of a SUCCESSFUL syncYearly doesn't immediately wipe it: the outer
    // syncYearly never throws here, only the inner range fetch did.
    logger.warn('next-year-range-failed', { districtId, startDate, endDate, error: String(e) });
    useUiStore.getState().setError({
      code: 'partial-sync',
      message: `next-year-range:${String(e)}`,
    });
    return [];
  }
}

// Cancel before reschedule so a sound-toggle doesn't leave surviving
// notifications firing with the previous channel/sound on Android, where
// channels freeze their sound at first registration. Errors propagate so
// the caller can surface them via uiStore/Alert.
export async function scheduleAfterToggle(
  districtId: string,
  districtName: string,
  timezone: string,
): Promise<void> {
  const cache = await syncYearly(districtId, districtName, timezone, { schedule: false });
  await cancelAllPrayerNotifications();
  await scheduleAll(cache, districtName);
}

// City change: fetch the new city's year WITHOUT scheduling, hard-reset every
// prior notification (enumeration-independent — see
// resetAllScheduledNotifications), then schedule the new city. This is the
// rules/00 S4 contract ("Şehir değiştirme → tüm pending iptal → yeniden
// zamanla"). The previous (force-only) path relied solely on reconcile's diff
// to drop the old city, which left it firing when getAll/id-recognition fell
// short on device — surfacing as notifications for BOTH cities. The fetch is
// awaited first so a failed switch resets nothing (errors propagate).
export async function resetScheduleForLocation(
  districtId: string,
  districtName: string,
  timezone: string,
): Promise<void> {
  const cache = await syncYearly(districtId, districtName, timezone, {
    force: true,
    schedule: false,
  });
  await resetAllScheduledNotifications();
  await scheduleAll(cache, districtName);
}

async function scheduleAll(
  cache: YearlyPrayerCache,
  districtName: string,
  forceReschedule = false,
): Promise<void> {
  await ensureAndroidChannel();
  const settings = useSettingsStore.getState();
  await reconcile(cache, {
    enabledPrayers: settings.enabledPrayers as PrayerKey[],
    sound: settings.sound,
    districtName,
    forceReschedule,
  });
}
