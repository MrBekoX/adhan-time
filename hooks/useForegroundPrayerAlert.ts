import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import type { YearlyPrayerCache } from '@/services/types';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
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
  // Shift the detected instant earlier by this much. 0 = the adhan itself;
  // reminderMinutes*60000 = the pre-prayer reminder (fires before the adhan).
  offsetMs = 0,
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
        const fireAt = parsePrayerTime(value, dateIso, tz).getTime() - offsetMs;
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

// The active foreground cue. `kind: 'adhan'` is the prayer time itself (minutes 0);
// `kind: 'reminder'` is the pre-prayer nudge fired `minutes` before that prayer.
export type ForegroundAlert = { key: PrayerKey; kind: 'adhan' | 'reminder'; minutes: number };
export type ForegroundPrayerAlert = { active: ForegroundAlert | null; dismiss: () => void };

// Foreground prayer cue — VISUAL ONLY. The OS notification plays the sound +
// vibration in every app state (setupForegroundHandler returns shouldPlaySound:
// true), so this hook just raises the in-app PrayerNowBanner when a prayer/reminder
// crosses while the app is open and the screen is on. A 1s tick checks whether an
// enabled prayer crossed since the previous tick; a window wider than MAX_LIVE_GAP_MS
// (the app was backgrounded across the prayer) is ignored so a late banner is never
// shown for something the user already saw — robust to AppState-event ordering.
export function useForegroundPrayerAlert(): ForegroundPrayerAlert {
  const [active, setActive] = useState<ForegroundAlert | null>(null);
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

      const cache = usePrayerStore.getState().cache;
      const loc = useLocationStore.getState().selected;
      const enabled = useSettingsStore.getState().enabledPrayers as PrayerKey[];
      const reminderMinutes = useSettingsStore.getState().reminderMinutes;

      // Adhan first (it owns the slot), then the pre-prayer reminder. They are
      // minutes apart so only one crosses per tick; checking adhan first just
      // makes the precedence explicit. The reminder is checked separately because
      // its instant (fireAt - offset) is not covered by the adhan crossing above,
      // so it would otherwise never get an in-app banner.
      let alert: ForegroundAlert | null = null;
      const adhanKey = detectPrayerCrossing(cache, loc, enabled, from, now);
      if (adhanKey) {
        alert = { key: adhanKey, kind: 'adhan', minutes: 0 };
      } else if (reminderMinutes > 0) {
        const reminderKey = detectPrayerCrossing(cache, loc, enabled, from, now, reminderMinutes * 60_000);
        if (reminderKey) alert = { key: reminderKey, kind: 'reminder', minutes: reminderMinutes };
      }
      if (!alert) return;

      // Visual only. The sound + vibration come from the OS notification itself
      // (setupForegroundHandler returns shouldPlaySound: true, and the channel
      // carries the vibration pattern), so they fire reliably even when the screen
      // is off — unlike a JS-timer chime, which Android suspends in that state.
      // Firing a chime/vibration here too would just double the cue when the
      // screen is on.
      setActive(alert);
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
