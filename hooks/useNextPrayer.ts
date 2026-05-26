import { useEffect, useState } from 'react';

import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import type { YearlyPrayerCache } from '@/services/types';
import { addLocalDays, isoDateInTz, parsePrayerTime } from '@/utils/time';

export type NextPrayer = {
  key: PrayerKey;
  dateIso: string;
  time: string;
  fireAt: Date;
  remainingMs: number;
};

type SelectedLocation = {
  districtId: string;
  timezone: string;
};

function cacheMatchesLocation(cache: YearlyPrayerCache, location: SelectedLocation): boolean {
  return cache.districtId === location.districtId && cache.timezone === location.timezone;
}

export function getNextPrayer(
  cache: YearlyPrayerCache | null,
  location: SelectedLocation | null,
  nowMs = Date.now(),
): NextPrayer | null {
  if (!cache || !location || !cacheMatchesLocation(cache, location)) return null;
  const tz = location.timezone;
  const todayIso = isoDateInTz(new Date(nowMs), tz);

  for (let d = 0; d < 2; d++) {
    const dateIso = addLocalDays(todayIso, d);
    const entry = cache.entries.find((e) => e.date.startsWith(dateIso));
    if (!entry) continue;
    for (const key of PRAYER_KEYS) {
      const value = entry.times?.[key];
      if (!value) continue;
      try {
        const fireAt = parsePrayerTime(value, dateIso, tz);
        if (fireAt.getTime() > nowMs) {
          return { key, dateIso, time: value, fireAt, remainingMs: fireAt.getTime() - nowMs };
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function useNextPrayer(): NextPrayer | null {
  const cache = usePrayerStore((s) => s.cache);
  const location = useLocationStore((s) => s.selected);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return getNextPrayer(cache, location, now);
}
