import { ezanvakti } from './ezanvaktiClient';
import { ensureAndroidChannel, reconcile } from './notificationScheduler';
import type { PrayerTime, YearlyPrayerCache } from './types';

import { PRAYER_CACHE_TTL_MS } from '@/constants/api';
import { ROLLING_WINDOW_DAYS } from '@/constants/notifications';
import type { PrayerKey } from '@/constants/prayers';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { logger } from '@/utils/logger';
import { addLocalDays, isoDateInTz, yearInTz } from '@/utils/time';

export async function syncYearly(
  districtId: string,
  districtName: string,
  timezone: string,
  options: { force?: boolean } = {},
): Promise<YearlyPrayerCache> {
  const force = options.force ?? false;
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
    await scheduleAll(cached, districtName);
    return cached;
  }

  logger.info('fetching yearly', { districtId, localYear });
  const entries = await ezanvakti.prayerTimesYearly(districtId);

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
  await scheduleAll(fresh, districtName);
  return fresh;
}

async function fetchNextYearStart(
  districtId: string,
  startDate: string,
  endDate: string,
): Promise<PrayerTime[]> {
  try {
    return await ezanvakti.prayerTimesRange(districtId, startDate, endDate);
  } catch (e) {
    logger.warn('next-year-range-failed', { districtId, startDate, endDate, error: String(e) });
    return [];
  }
}

async function scheduleAll(cache: YearlyPrayerCache, districtName: string): Promise<void> {
  await ensureAndroidChannel();
  const settings = useSettingsStore.getState();
  await reconcile(cache, {
    enabledPrayers: settings.enabledPrayers as PrayerKey[],
    sound: settings.sound,
    districtName,
  });
}
