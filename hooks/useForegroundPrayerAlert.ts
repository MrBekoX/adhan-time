import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { playForegroundChime } from '@/services/foregroundChime';
import type { YearlyPrayerCache } from '@/services/types';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { logger } from '@/utils/logger';
import { addLocalDays, isoDateInTz, parsePrayerTime } from '@/utils/time';

type SelectedLocation = { districtId: string; timezone: string };

// Pure: did an ENABLED prayer's fire instant fall inside the half-open window
// (fromMs, toMs]? The lower bound is exclusive so a prayer detected on one tick
// is never re-reported on the next; the upper bound is inclusive so the exact
// fire instant counts. Returns the earliest such prayer key, or null.
export function detectPrayerCrossing(
  cache: YearlyPrayerCache | null,
  location: SelectedLocation | null,
  enabled: PrayerKey[],
  fromMs: number,
  toMs: number,
): PrayerKey | null {
  if (!cache || !location || toMs <= fromMs) return null;
  if (cache.districtId !== location.districtId || cache.timezone !== location.timezone) return null;

  const tz = location.timezone;
  const enabledSet = new Set(enabled);
  const fromIso = isoDateInTz(new Date(fromMs), tz);

  // Two local days cover a window that straddles local midnight.
  for (let d = 0; d < 2; d++) {
    const dateIso = addLocalDays(fromIso, d);
    const entry = cache.entries.find((e) => e.date.startsWith(dateIso));
    if (!entry) continue;
    for (const key of PRAYER_KEYS) {
      if (!enabledSet.has(key)) continue;
      const value = entry.times?.[key];
      if (!value) continue;
      try {
        const fireAt = parsePrayerTime(value, dateIso, tz).getTime();
        if (fireAt > fromMs && fireAt <= toMs) return key;
      } catch {
        continue;
      }
    }
  }
  return null;
}

const TICK_MS = 1000;
// A tick window wider than this means the JS loop was suspended (app backgrounded)
// or heavily throttled; any prayer in that gap was already delivered by the OS
// notification, so skip it rather than fire a late/duplicate in-app cue.
const MAX_LIVE_GAP_MS = 3000;
const AUTO_DISMISS_MS = 12000;

export type ForegroundPrayerAlert = { active: PrayerKey | null; dismiss: () => void };

// Foreground prayer cue. expo-notifications drops a notification that fires while
// the app is in the foreground (its JS handler has a hard 3s timeout — rules/04),
// so when a prayer time arrives with the app open we own the cue ourselves:
// haptic + bundled chime + an in-app banner. A 1s tick checks whether an enabled
// prayer crossed since the previous tick; a window wider than MAX_LIVE_GAP_MS (the
// app was backgrounded across the prayer) is ignored so the OS notification's
// delivery is never double-alerted in-app — robust to AppState-event ordering.
export function useForegroundPrayerAlert(): ForegroundPrayerAlert {
  const [active, setActive] = useState<PrayerKey | null>(null);
  const lastTickRef = useRef(Date.now());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setActive(null);
  }, []);

  useEffect(() => {
    lastTickRef.current = Date.now();

    const id = setInterval(() => {
      const now = Date.now();
      const from = lastTickRef.current;
      // Always advance the window so it stays ~TICK_MS wide during steady use.
      lastTickRef.current = now;

      // Backgrounded → the OS notification owns delivery; never alert in-app.
      if (AppState.currentState !== 'active') return;
      // Over-long window ⇒ the JS loop was suspended across the prayer; the OS
      // already delivered it, so skip (no late/duplicate cue).
      if (now - from > MAX_LIVE_GAP_MS) return;

      const crossed = detectPrayerCrossing(
        usePrayerStore.getState().cache,
        useLocationStore.getState().selected,
        useSettingsStore.getState().enabledPrayers as PrayerKey[],
        from,
        now,
      );
      if (!crossed) return;

      setActive(crossed);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      void playForegroundChime().catch((e) =>
        logger.warn('foreground-chime-failed', { error: String(e) }),
      );
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null;
        setActive(null);
      }, AUTO_DISMISS_MS);
    }, TICK_MS);

    return () => {
      clearInterval(id);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  return { active, dismiss };
}
