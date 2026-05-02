import { ezanvakti } from './ezanvaktiClient';
import { ensureAndroidChannel, reconcile } from './notificationScheduler';
import type { YearlyPrayerCache } from './types';

import { PRAYER_CACHE_TTL_MS } from '@/constants/api';
import type { PrayerKey } from '@/constants/prayers';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { logger } from '@/utils/logger';


export async function syncYearly(
  districtId: string,
  districtName: string,
  timezone: string,
  options: { force?: boolean } = {},
): Promise<YearlyPrayerCache> {
  const force = options.force ?? false;
  const now = new Date();
  const year = now.getUTCFullYear();
  const cached = usePrayerStore.getState().cache;

  if (
    !force &&
    cached &&
    cached.districtId === districtId &&
    cached.year === year &&
    cached.timezone === timezone &&
    Date.now() - new Date(cached.fetchedAt).getTime() < PRAYER_CACHE_TTL_MS
  ) {
    await scheduleAll(cached, districtName);
    return cached;
  }

  logger.info('fetching yearly', { districtId });
  const data = await ezanvakti.prayerTimesYearly(districtId);
  const fresh: YearlyPrayerCache = {
    districtId,
    year,
    fetchedAt: new Date().toISOString(),
    timezone,
    entries: data,
  };
  usePrayerStore.getState().setCache(fresh);
  await scheduleAll(fresh, districtName);
  return fresh;
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
