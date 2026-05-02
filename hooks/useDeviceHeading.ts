import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { HEADING_ACCURACY, HEADING_EMA_ALPHA } from '@/constants/qibla';
import { logger } from '@/utils/logger';

export type HeadingQuality = 'high' | 'medium' | 'low' | 'unreliable' | 'unknown';

export type HeadingStatus =
  | { kind: 'idle' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      /** Smoothed heading in [0, 360) — degrees clockwise from geographic north. */
      heading: number;
      /** 'true' = geographic north, 'magnetic' = uncorrected (only when trueHeading unavailable). */
      source: 'true' | 'magnetic';
      /** Approximate accuracy in degrees (normalized across platforms). null if unknown. */
      accuracyDeg: number | null;
      quality: HeadingQuality;
    };

type Options = { enabled: boolean };

export function useDeviceHeading({ enabled }: Options): HeadingStatus {
  const [status, setStatus] = useState<HeadingStatus>({ kind: 'idle' });

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let smoothed: number | null = null;

    void (async () => {
      try {
        subscription = await Location.watchHeadingAsync((reading) => {
          if (cancelled) return;

          const trueHeading = reading.trueHeading ?? -1;
          const magHeading = reading.magHeading ?? -1;
          const raw = trueHeading >= 0 ? trueHeading : magHeading;
          if (raw < 0) return;

          smoothed = applyEma(smoothed, raw, HEADING_EMA_ALPHA);
          const accuracyDeg = normalizeAccuracy(reading.accuracy);

          setStatus({
            kind: 'ready',
            heading: smoothed,
            source: trueHeading >= 0 ? 'true' : 'magnetic',
            accuracyDeg,
            quality: classifyQuality(accuracyDeg),
          });
        });
      } catch (e) {
        logger.error('useDeviceHeading failed', { error: String(e) });
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

function applyEma(prev: number | null, raw: number, alpha: number): number {
  if (prev === null) return raw;
  // Handle the 0/360 wrap by smoothing along the shortest arc.
  let delta = raw - prev;
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  const next = prev + alpha * delta;
  return (next + 360) % 360;
}

function normalizeAccuracy(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (Platform.OS === 'ios') return value; // iOS reports degrees directly
  // Android: Location.Accuracy levels — empirical mapping to a degree-equivalent scale.
  // 3 (high) → 5°, 2 (medium) → 15°, 1 (low) → 30°, 0 (unreliable) → 50°, -1 → unknown.
  if (value < 0) return null;
  if (value >= 3) return 5;
  if (value >= 2) return 15;
  if (value >= 1) return 30;
  return 50;
}

function classifyQuality(accuracyDeg: number | null): HeadingQuality {
  if (accuracyDeg === null) return 'unknown';
  if (accuracyDeg <= HEADING_ACCURACY.goodMaxDeg) return 'high';
  if (accuracyDeg <= HEADING_ACCURACY.warnMaxDeg) return 'medium';
  if (accuracyDeg <= HEADING_ACCURACY.lowMaxDeg) return 'low';
  return 'unreliable';
}
