import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import type { YearlyPrayerCache } from '@/services/types';
import { isoDateInTz } from '@/utils/time';

export type TodayPrayers = {
  dateIso: string;
  rows: { key: PrayerKey; time: string }[];
} | null;

type SelectedLocation = {
  districtId: string;
  timezone: string;
};

function cacheMatchesLocation(cache: YearlyPrayerCache, location: SelectedLocation): boolean {
  return cache.districtId === location.districtId && cache.timezone === location.timezone;
}

export function selectTodayPrayers(
  cache: YearlyPrayerCache | null,
  location: SelectedLocation | null,
  now = new Date(),
): TodayPrayers {
  if (!cache || !location || !cacheMatchesLocation(cache, location)) return null;
  const dateIso = isoDateInTz(now, location.timezone);
  const entry = cache.entries.find((e) => e.date.startsWith(dateIso));
  if (!entry) return null;
  return {
    dateIso,
    rows: PRAYER_KEYS.map((key) => ({ key, time: entry.times[key] })),
  };
}

export function useTodayPrayers(): TodayPrayers {
  const cache = usePrayerStore((s) => s.cache);
  const location = useLocationStore((s) => s.selected);
  return selectTodayPrayers(cache, location);
}
