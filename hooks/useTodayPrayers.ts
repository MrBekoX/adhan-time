import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import { isoDateInTz } from '@/utils/time';

export type TodayPrayers = {
  dateIso: string;
  rows: { key: PrayerKey; time: string }[];
} | null;

export function useTodayPrayers(): TodayPrayers {
  const cache = usePrayerStore((s) => s.cache);
  const location = useLocationStore((s) => s.selected);
  if (!cache || !location) return null;
  const dateIso = isoDateInTz(new Date(), location.timezone);
  const entry = cache.entries.find((e) => e.date.startsWith(dateIso));
  if (!entry) return null;
  return {
    dateIso,
    rows: PRAYER_KEYS.map((key) => ({ key, time: entry[key] })),
  };
}
