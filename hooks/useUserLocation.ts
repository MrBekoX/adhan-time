import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { logger } from '@/utils/logger';

// A fast, low-accuracy first fix (network/last-cell) so the compass can paint
// quickly; the bearing to a distant Kaaba is insensitive to a few hundred metres.
const COARSE_OPTIONS = {
  accuracy: Location.Accuracy.Low,
  mayShowUserSettingsDialog: true,
} satisfies Location.LocationOptions;
// The refining fix + the ongoing watch use Balanced (fused/GPS) accuracy.
const FINE_OPTIONS = {
  accuracy: Location.Accuracy.Balanced,
  mayShowUserSettingsDialog: true,
} satisfies Location.LocationOptions;
const LOCATION_WATCH_OPTIONS = {
  ...FINE_OPTIONS,
  distanceInterval: 25,
  timeInterval: 5000,
} satisfies Location.LocationOptions;
const LAST_KNOWN_OPTIONS = {
  maxAge: 10 * 60 * 1000,
  requiredAccuracy: 1000,
} satisfies Location.LocationLastKnownOptions;
// A one-shot fix that has not arrived in this long is abandoned — but abandoning
// it is NOT fatal: the watch stays subscribed and may still deliver.
const COARSE_FIX_TIMEOUT_MS = 8000;
const FINE_FIX_TIMEOUT_MS = 20000;

export type LocationStatus =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'denied' }
  | { kind: 'servicesOff' }
  | { kind: 'acquiring' }
  // Non-fatal: every fast source (last-known + one-shot fixes) has failed but the
  // ongoing watch is still alive and may yet deliver a fix. We must NOT report a
  // hard 'error' here — that lies to the user (qibla.tsx maps 'error' to a generic
  // failure) when the device simply hasn't produced a fix yet.
  | { kind: 'searchingSlow' }
  | { kind: 'ready'; lat: number; lon: number; accuracyM: number }
  | { kind: 'error'; message: string };

type Options = {
  /** When false, the hook is paused (used to release sensors when the screen is unfocused). */
  enabled: boolean;
};

function statusFromPosition(pos: Location.LocationObject): LocationStatus {
  return {
    kind: 'ready',
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracyM: pos.coords.accuracy ?? 0,
  };
}

export function useUserLocation({ enabled }: Options): LocationStatus {
  const [status, setStatus] = useState<LocationStatus>({ kind: 'idle' });

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let hasPosition = false;
    let bestAccuracyM = Number.POSITIVE_INFINITY;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const clearAllTimers = () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };

    // Ongoing live fixes (watch) always win — the displayed position should follow
    // the user. accuracyM is rendered honestly, so a looser live fix is not a lie,
    // just a wider error bar.
    const publishLive = (pos: Location.LocationObject) => {
      if (cancelled) return;
      hasPosition = true;
      bestAccuracyM = pos.coords.accuracy ?? bestAccuracyM;
      setStatus(statusFromPosition(pos));
    };

    // One-shot / last-known fixes only publish if they don't downgrade the best
    // fix already on screen, so a slow coarse fix can't clobber a tight one.
    const publishIfBetter = (pos: Location.LocationObject) => {
      if (cancelled) return;
      const accuracyM = pos.coords.accuracy ?? Number.POSITIVE_INFINITY;
      if (hasPosition && accuracyM > bestAccuracyM) return;
      hasPosition = true;
      bestAccuracyM = accuracyM;
      setStatus(statusFromPosition(pos));
    };

    const getFixWithTimeout = (
      options: Location.LocationOptions,
      timeoutMs: number,
      tier: 'coarse' | 'fine',
    ) =>
      new Promise<Location.LocationObject>((resolve, reject) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          reject(new Error(`getCurrentPosition ${tier} timed out`));
        }, timeoutMs);
        timers.add(timer);
        Location.getCurrentPositionAsync(options).then(
          (pos) => {
            clearTimeout(timer);
            timers.delete(timer);
            resolve(pos);
          },
          (e) => {
            clearTimeout(timer);
            timers.delete(timer);
            reject(e);
          },
        );
      });

    // A one-shot tier: a timeout or provider rejection is logged but NEVER fatal.
    const tryFix = (options: Location.LocationOptions, timeoutMs: number, tier: 'coarse' | 'fine') =>
      getFixWithTimeout(options, timeoutMs, tier)
        .then((pos) => {
          if (cancelled) return;
          logger.info('useUserLocation: getCurrent resolved', {
            tier,
            accuracyM: pos.coords.accuracy ?? null,
          });
          publishIfBetter(pos);
        })
        .catch((e) => {
          logger.warn('useUserLocation: getCurrent gave up', { tier, error: String(e) });
        });

    void (async () => {
      try {
        setStatus({ kind: 'requesting' });
        logger.info('useUserLocation: start', { enabled });

        const services = await Location.hasServicesEnabledAsync();
        if (cancelled) return;
        logger.info('useUserLocation: services', { enabled: services });
        if (!services) {
          setStatus({ kind: 'servicesOff' });
          return;
        }

        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        logger.info('useUserLocation: permission', {
          status: perm.status,
          canAskAgain: perm.canAskAgain,
          androidAccuracy: perm.android?.accuracy ?? null,
        });
        if (perm.status !== 'granted') {
          setStatus({ kind: 'denied' });
          return;
        }

        setStatus({ kind: 'acquiring' });

        const lastKnown = await Location.getLastKnownPositionAsync(LAST_KNOWN_OPTIONS);
        if (cancelled) return;
        logger.info('useUserLocation: lastKnown', {
          hit: !!lastKnown,
          accuracyM: lastKnown?.coords.accuracy ?? null,
        });
        if (lastKnown) publishIfBetter(lastKnown);

        // The watch is the authoritative ongoing source. Subscribe it before the
        // one-shots so a stalled one-shot can never strand us in a hard error.
        Location.watchPositionAsync(LOCATION_WATCH_OPTIONS, publishLive, (reason) => {
          logger.warn('useUserLocation: watch error', { reason });
        })
          .then((nextSubscription) => {
            if (cancelled) {
              nextSubscription.remove();
              return;
            }
            subscription = nextSubscription;
            logger.info('useUserLocation: watch subscribed');
          })
          .catch((e) => {
            logger.warn('useUserLocation: watch subscribe failed', { error: String(e) });
          });

        // Fast coarse fix + concurrent fine refine. Neither timing out is fatal.
        await Promise.allSettled([
          tryFix(COARSE_OPTIONS, COARSE_FIX_TIMEOUT_MS, 'coarse'),
          tryFix(FINE_OPTIONS, FINE_FIX_TIMEOUT_MS, 'fine'),
        ]);
        if (cancelled) return;

        // Every fast source failed. Do NOT lie with a hard error — the watch is
        // still alive and may yet deliver. Surface an honest "still searching".
        if (!hasPosition) {
          logger.warn('useUserLocation: one-shot fixes exhausted; watch still searching');
          setStatus({ kind: 'searchingSlow' });
        }
      } catch (e) {
        logger.error('useUserLocation failed', { error: String(e) });
        if (!cancelled && !hasPosition) setStatus({ kind: 'error', message: String(e) });
      }
    })();

    return () => {
      cancelled = true;
      clearAllTimers();
      subscription?.remove();
    };
  }, [enabled]);

  return status;
}
