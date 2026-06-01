import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  HEADING_EMA_ALPHA,
  HEADING_PUBLISH_MIN_DELTA_DEG,
  HEADING_PUBLISH_MIN_INTERVAL_MS,
} from '@/constants/qibla';
import * as CompassHeading from '@/modules/compass-heading';
import { selectHeadingSource } from '@/utils/declination';
import {
  applyEma,
  classifyQuality,
  headingSmoothingAlphaForPlatform,
  normalizeAccuracyForPlatform,
  shouldPublishHeadingUpdate,
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

type Options = {
  enabled: boolean;
  /**
   * User's geographic position. When provided and the OS only exposes magnetic heading
   * (Android without GPS-derived declination), the hook applies NOAA WMM declination
   * compensation so the resulting heading is referenced to true north (SPEC-K2).
   */
  location?: { lat: number; lon: number } | null;
};

export function useDeviceHeading({ enabled, location = null }: Options): HeadingStatus {
  const [status, setStatus] = useState<HeadingStatus>({ kind: 'idle' });

  // Stash location in a ref so the watchHeadingAsync callback always sees the latest
  // position without forcing a resubscribe (which would drop sensor stream continuity).
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    let removeSubscription: (() => void) | null = null;
    let usingFusedSource = false;
    let smoothed: number | null = null;
    let lastPublishedHeading: number | null = null;
    let lastPublishedAt = 0;
    let lastPublishedQuality: HeadingQuality | null = null;
    let lastPublishedSource: 'true' | 'magnetic' | null = null;

    // CompassHeading.HeadingReading is shape-compatible with expo-location's
    // LocationHeadingObject, so one handler serves both the native and fallback sources.
    const handleReading = (reading: CompassHeading.HeadingReading) => {
      if (cancelled) return;

      const selected = selectHeadingSource({
        trueHeading: reading.trueHeading ?? -1,
        magHeading: reading.magHeading ?? -1,
        location: locationRef.current,
      });
      if (selected === null) return;

      const platformOS = Platform.OS as PlatformOS;
      // The fused native stream (rotation-vector / CLHeading) is clean ~20ms input → light
      // EMA per spec §8. The expo-location fallback azimuth is noisy → keep the heavier
      // platform clamp so the fallback needle stays stable.
      const smoothingAlpha = usingFusedSource
        ? HEADING_EMA_ALPHA
        : headingSmoothingAlphaForPlatform(platformOS, HEADING_EMA_ALPHA);
      smoothed = applyEma(smoothed, selected.heading, smoothingAlpha);
      const accuracyDeg = normalizeAccuracyForPlatform(reading.accuracy, platformOS);
      const quality = classifyQuality(accuracyDeg);
      const metadataChanged =
        selected.source !== lastPublishedSource || quality !== lastPublishedQuality;
      const now = Date.now();
      if (
        !metadataChanged &&
        !shouldPublishHeadingUpdate({
          previousHeading: lastPublishedHeading,
          nextHeading: smoothed,
          elapsedMs: now - lastPublishedAt,
          minIntervalMs: HEADING_PUBLISH_MIN_INTERVAL_MS,
          minDeltaDeg: HEADING_PUBLISH_MIN_DELTA_DEG,
        })
      ) {
        return;
      }
      lastPublishedHeading = smoothed;
      lastPublishedAt = now;
      lastPublishedQuality = quality;
      lastPublishedSource = selected.source;

      setStatus({ kind: 'ready', heading: smoothed, source: selected.source, accuracyDeg, quality });
    };

    void (async () => {
      try {
        if (CompassHeading.isAvailable()) {
          usingFusedSource = true;
          const sub = CompassHeading.addHeadingListener(handleReading);
          if (cancelled) {
            sub.remove();
            return;
          }
          removeSubscription = () => sub.remove();
          return;
        }
        // Fallback: device without a rotation-vector sensor (or Expo Go) → expo-location.
        const sub = await Location.watchHeadingAsync(handleReading);
        if (cancelled) {
          sub.remove();
          return;
        }
        removeSubscription = () => sub.remove();
      } catch (e) {
        logger.error('useDeviceHeading failed', { error: String(e) });
        if (!cancelled) setStatus({ kind: 'error', message: String(e) });
      }
    })();

    return () => {
      cancelled = true;
      removeSubscription?.();
    };
  }, [enabled]);

  return status;
}

