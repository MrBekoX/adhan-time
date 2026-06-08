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
  INTERFERENCE_HOLD_MS,
  ONE_EURO_BETA,
  ONE_EURO_DCUTOFF,
  ONE_EURO_MIN_CUTOFF,
} from '@/constants/qibla';
import * as CompassHeading from '@/modules/compass-heading';
import { computeExpectedFieldMicroTesla, selectHeadingSource } from '@/utils/declination';
import {
  applyEma,
  headingSmoothingAlphaForPlatform,
  isInterference,
  resolveHeadingReliability,
  shouldPublishHeadingUpdate,
  signedDelta,
  type HeadingQuality,
  type PlatformOS,
  type ReliabilityReason,
} from '@/utils/heading';
import { logger } from '@/utils/logger';

export type { HeadingQuality, ReliabilityReason };

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
      /** Approximate accuracy in degrees (normalized across platforms). null if unknown/interfered. */
      accuracyDeg: number | null;
      quality: HeadingQuality;
      /** Recovery action when unreliable: 'interference' (move away from metal), 'calibrate', or null. */
      reason: ReliabilityReason;
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
    lastPublishedReason: ReliabilityReason | null;
    /** Wall-clock ms until which interference is HELD active (time hysteresis vs banner flicker). */
    interferenceUntil: number;
  }>({
    smoothed: null,
    lastSharedHeading: null,
    lastPublishedHeading: null,
    lastPublishedAt: 0,
    lastPublishedQuality: null,
    lastPublishedSource: null,
    lastPublishedReason: null,
    interferenceUntil: 0,
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
      // Fused path: smoothing now lives in the native One Euro filter, so pass the heading
      // through here (a second JS EMA would re-introduce lag — the very thing we removed).
      // Fallback (expo-location) path is noisy and unfiltered → keep the platform-clamped EMA.
      const next = usingFusedSource
        ? selected.heading
        : applyEma(
            st.smoothed,
            selected.heading,
            headingSmoothingAlphaForPlatform(platformOS, HEADING_EMA_ALPHA),
          );
      st.smoothed = next;
      // UI-thread animation source: write samples (past a small deadband) so the rose reads
      // this on the UI thread, independent of React's gated re-renders. The deadband skips
      // sub-0.4° sensor jitter while stationary, so the rose tween settles and the screen
      // idles instead of redrawing every frame (see HEADING_SHARED_DEADBAND_DEG).
      // Resolve reliability from ALL sensor signals (fused accuracy + RAW magnetometer accuracy +
      // field-magnitude interference vs the expected geomagnetic intensity), not just the OEM's fused
      // accuracy — which reads "high" under interference / an uncalibrated mag (rules/11).
      const loc = locationRef.current;
      const expectedFieldMicroTesla = loc
        ? computeExpectedFieldMicroTesla(loc.lat, loc.lon)
        : null;
      const now = Date.now();
      // Interference with TIME HYSTERESIS: a moving phone makes |B| swing across the threshold, which
      // flickered the banner on/off. Hold the "interfered" state for INTERFERENCE_HOLD_MS after the
      // last raw detection, so it stays a single stable warning until the field has been clean that long.
      const rawInterference = isInterference(
        typeof reading.fieldMicroTesla === 'number' ? reading.fieldMicroTesla : null,
        expectedFieldMicroTesla,
      );
      if (rawInterference) st.interferenceUntil = now + INTERFERENCE_HOLD_MS;
      const { accuracyDeg, quality, reason } = resolveHeadingReliability(
        {
          primaryAccuracy: reading.accuracy,
          magAccuracy: typeof reading.magAccuracy === 'number' ? reading.magAccuracy : null,
          interference: now < st.interferenceUntil,
        },
        platformOS,
      );

      // FREEZE the rose when unreliable (interference / uncalibrated): do NOT push a garbage heading
      // to the UI-thread source — the dial holds its last position while the banner tells the user how
      // to recover. Feeding it would reproduce the "kafasına göre" garbage swing the user saw (and the
      // market compasses avoid). The deadband still rejects idle jitter on a reliable stream.
      const hs = headingSharedRef.current;
      if (
        hs &&
        quality !== 'unreliable' &&
        (st.lastSharedHeading === null ||
          Math.abs(signedDelta(next, st.lastSharedHeading)) >= HEADING_SHARED_DEADBAND_DEG)
      ) {
        hs.value = next;
        st.lastSharedHeading = next;
      }

      const metadataChanged =
        selected.source !== st.lastPublishedSource ||
        quality !== st.lastPublishedQuality ||
        reason !== st.lastPublishedReason;
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
      st.lastPublishedReason = reason;

      setStatus({ kind: 'ready', heading: next, source: selected.source, accuracyDeg, quality, reason });
    };

    void (async () => {
      try {
        if (CompassHeading.isAvailable()) {
          usingFusedSource = true;
          CompassHeading.setTuning(ONE_EURO_MIN_CUTOFF, ONE_EURO_BETA, ONE_EURO_DCUTOFF);
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

