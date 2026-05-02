import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { logger } from '@/utils/logger';

export type LocationStatus =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'denied' }
  | { kind: 'servicesOff' }
  | { kind: 'acquiring' }
  | { kind: 'ready'; lat: number; lon: number; accuracyM: number }
  | { kind: 'error'; message: string };

type Options = {
  /** When false, the hook is paused (used to release sensors when the screen is unfocused). */
  enabled: boolean;
};

export function useUserLocation({ enabled }: Options): LocationStatus {
  const [status, setStatus] = useState<LocationStatus>({ kind: 'idle' });

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      setStatus({ kind: 'requesting' });

      const services = await Location.hasServicesEnabledAsync();
      if (cancelled) return;
      if (!services) {
        setStatus({ kind: 'servicesOff' });
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== 'granted') {
        setStatus({ kind: 'denied' });
        return;
      }

      setStatus({ kind: 'acquiring' });

      try {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setStatus({
          kind: 'ready',
          lat: initial.coords.latitude,
          lon: initial.coords.longitude,
          accuracyM: initial.coords.accuracy ?? 0,
        });

        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 5000 },
          (pos) => {
            setStatus({
              kind: 'ready',
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracyM: pos.coords.accuracy ?? 0,
            });
          },
        );
      } catch (e) {
        logger.error('useUserLocation failed', { error: String(e) });
        if (!cancelled) setStatus({ kind: 'error', message: String(e) });
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return status;
}
