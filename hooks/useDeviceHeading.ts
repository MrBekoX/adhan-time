import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { HEADING_EMA_ALPHA } from '@/constants/qibla';
import {
  applyEma,
  classifyQuality,
  normalizeAccuracyForPlatform,
  type HeadingQuality,
  type PlatformOS,
} from '@/utils/heading';
import { logger } from '@/utils/logger';

export type { HeadingQuality };

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
          const accuracyDeg = normalizeAccuracyForPlatform(
            reading.accuracy,
            Platform.OS as PlatformOS,
          );

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

