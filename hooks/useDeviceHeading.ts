import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import {
  HEADING_EMA_ALPHA,
  HEADING_PUBLISH_MIN_DELTA_DEG,
  HEADING_PUBLISH_MIN_IDLE_DELTA_DEG,
  HEADING_PUBLISH_MIN_INTERVAL_MS,
  HEADING_SHARED_DEADBAND_DEG,
} from '@/constants/qibla';
import * as CompassHeading from '@/modules/compass-heading';
import { selectHeadingSource } from '@/utils/declination';
import {
  applyEma,
  classifyQuality,
  headingSmoothingAlphaForPlatform,
  normalizeAccuracyForPlatform,
  shouldPublishHeadingUpdate,
  signedDelta,
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
  /**
   * Optional shared value that receives EVERY smoothed sample (ungated), so the compass
   * animation can run on the UI thread at sensor rate, decoupled from React's re-render
   * cadence (which janks on low-end devices and made the needle "step"). React state below
   * stays gated for the textual/alignment UI.
   */
  headingShared?: SharedValue<number>;
};

export function useDeviceHeading({
  enabled,
  location = null,
  headingShared,
}: Options): HeadingStatus {
  const [status, setStatus] = useState<HeadingStatus>({ kind: 'idle' });

  // Stash location in a ref so the watchHeadingAsync callback always sees the latest
  // position without forcing a resubscribe (which would drop sensor stream continuity).
  const locationRef = useRef(location);
  locationRef.current = location;

  // Same ref pattern for the optional shared value (stable identity, no resubscribe).
  const headingSharedRef = useRef(headingShared);
  headingSharedRef.current = headingShared;

  // Smoothing accumulators live in a ref (NOT the effect closure) so a focus
  // blur/refocus — which flips `enabled` and tears down + resubscribes the sensor
  // (effect dep [enabled]) — does NOT reset the EMA baseline. Resetting it
  // republished the first post-resubscribe reading RAW, snapping the rose from a
  // cold baseline (the on-device "freeze then jump"). Persisting it lets the
  // stream resume from where it left off. (Qibla bug A1.)
  const stateRef = useRef<{
    smoothed: number | null;
    lastSharedHeading: number | null;
    lastPublishedHeading: number | null;
    lastPublishedAt: number;
    lastPublishedQuality: HeadingQuality | null;
    lastPublishedSource: 'true' | 'magnetic' | null;
  }>({
    smoothed: null,
    lastSharedHeading: null,
    lastPublishedHeading: null,
    lastPublishedAt: 0,
    lastPublishedQuality: null,
    lastPublishedSource: null,
  });

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    let removeSubscription: (() => void) | null = null;
    let usingFusedSource = false;
    // Smoothing accumulators persist across resubscribes via stateRef (Qibla bug A1):
    // a focus blur/refocus must not reset the EMA baseline and snap the rose.
    const st = stateRef.current;

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
      const next = applyEma(st.smoothed, selected.heading, smoothingAlpha);
      st.smoothed = next;
      // UI-thread animation source: write samples (past a small deadband) so the rose reads
      // this on the UI thread, independent of React's gated re-renders. The deadband skips
      // sub-0.4° sensor jitter while stationary, so the rose tween settles and the screen
      // idles instead of redrawing every frame (see HEADING_SHARED_DEADBAND_DEG).
      const hs = headingSharedRef.current;
      if (
        hs &&
        (st.lastSharedHeading === null ||
          Math.abs(signedDelta(next, st.lastSharedHeading)) >= HEADING_SHARED_DEADBAND_DEG)
      ) {
        hs.value = next;
        st.lastSharedHeading = next;
      }
      const accuracyDeg = normalizeAccuracyForPlatform(reading.accuracy, platformOS);
      const quality = classifyQuality(accuracyDeg);
      const metadataChanged =
        selected.source !== st.lastPublishedSource || quality !== st.lastPublishedQuality;
      const now = Date.now();
      if (
        !metadataChanged &&
        !shouldPublishHeadingUpdate({
          previousHeading: st.lastPublishedHeading,
          nextHeading: next,
          elapsedMs: now - st.lastPublishedAt,
          minIntervalMs: HEADING_PUBLISH_MIN_INTERVAL_MS,
          minDeltaDeg: HEADING_PUBLISH_MIN_DELTA_DEG,
          minIdleDeltaDeg: HEADING_PUBLISH_MIN_IDLE_DELTA_DEG,
        })
      ) {
        return;
      }
      st.lastPublishedHeading = next;
      st.lastPublishedAt = now;
      st.lastPublishedQuality = quality;
      st.lastPublishedSource = selected.source;

      setStatus({ kind: 'ready', heading: next, source: selected.source, accuracyDeg, quality });
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

