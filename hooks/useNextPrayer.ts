import { useEffect, useState } from 'react';

import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isoDateInTz, parsePrayerTime } from '@/utils/time';

export type NextPrayer = {
  key: PrayerKey;
  fireAt: Date;
  remainingMs: number;
};

export function useNextPrayer(): NextPrayer | null {
  const cache = usePrayerStore((s) => s.cache);
  const location = useLocationStore((s) => s.selected);
  const enabled = useSettingsStore((s) => s.enabledPrayers);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!cache || !location) return null;
  const tz = location.timezone;
  const today = new Date(now);

  for (let d = 0; d < 2; d++) {
    const dayDate = new Date(today.getTime() + d * 86400_000);
    const dateIso = isoDateInTz(dayDate, tz);
    const entry = cache.entries.find((e) => e.date.startsWith(dateIso));
    if (!entry) continue;
    for (const key of PRAYER_KEYS) {
      if (!enabled.includes(key)) continue;
      const value = entry.times?.[key];
      if (!value) continue;
      const fireAt = parsePrayerTime(value, dateIso, tz);
      if (fireAt.getTime() > now) {
        return { key, fireAt, remainingMs: fireAt.getTime() - now };
      }
    }
  }
  return null;
}
