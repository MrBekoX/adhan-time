/**
 * Magnetic declination compensation for the qibla compass.
 *
 * Background: a phone's raw magnetometer points to magnetic north, which is
 * offset from geographic ("true") north by the local declination. The offset
 * varies from a few degrees in some regions to 25°+ near the poles. iOS
 * compensates internally and returns `trueHeading`; some Android paths only
 * return `magHeading`. Without compensation, the qibla bearing — which is a
 * geographic bearing — would be wrong by exactly the local declination.
 *
 * Computes declination via the NOAA World Magnetic Model (geomagnetism package).
 * SPEC-K2.
 */

import geomagnetism from 'geomagnetism';

import { logger } from './logger';

// Single-entry memo for the result below. The qibla hook calls
// computeMagneticDeclination on EVERY heading sample (~50 Hz once GPS locks,
// since the Android compass sends only a magnetic azimuth). Each miss rebuilds
// the WMM model (new Model + getTimedModel allocates four ~90-element coeff
// arrays) and runs the spherical-harmonic expansion (Legendre + harmonic
// arrays) — ~12 allocations/call. At 50 Hz that churn triggered periodic Hermes
// GC pauses on low-end devices (Galaxy A30s) that stalled the JS callback, so
// `headingShared` stopped updating and the rose spring settled then jumped when
// the thread caught up. Declination only depends on position + date and is flat
// to <0.1°/yr, so a held phone recomputes it needlessly. Quantize to ~1 km /
// 1 day and reuse: a hit returns a cached number with zero allocation.
let memoKey: string | null = null;
let memoValue: number | null = null;

function declinationCacheKey(lat: number, lon: number, date: Date): string {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}:${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

/**
 * Returns the magnetic declination at (lat, lon) on the given date, in degrees.
 * East-positive, west-negative — matches the NOAA WMM convention.
 *
 * Returns null when the model fails (e.g. coordinates out of range, library error)
 * — callers must surface this as "unreliable" rather than silently treating
 * the magnetic reading as if it were geographic.
 *
 * Memoized on a quantized (lat, lon, day) key — see the comment above for why.
 */
export function computeMagneticDeclination(
  lat: number,
  lon: number,
  date: Date = new Date(),
): number | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const key = declinationCacheKey(lat, lon, date);
  if (key === memoKey) return memoValue;
  try {
    const point = geomagnetism.model(date).point([lat, lon]);
    if (!Number.isFinite(point.decl)) return null;
    memoKey = key;
    memoValue = point.decl;
    return memoValue;
  } catch (e) {
    logger.warn('declination-compute-failed', { lat, lon, error: String(e) });
    return null;
  }
}

/**
 * Applies a declination correction to a magnetic heading, returning a heading
 * referenced to true north in [0, 360).
 *
 * trueHeading = (magHeading + declination + 360) % 360
 *
 * Positive declination (east) shifts the corrected heading clockwise; negative
 * declination (west) shifts it counter-clockwise.
 */
export function applyDeclinationToHeading(magHeading: number, declination: number): number {
  return ((magHeading + declination) % 360 + 360) % 360;
}

export type HeadingSourceInput = {
  /** Raw `trueHeading` from `expo-location` — `-1` (or any negative) means unavailable. */
  trueHeading: number;
  /** Raw `magHeading` from `expo-location` — `-1` means unavailable. */
  magHeading: number;
  /** User's geographic position (used to compute WMM declination); null disables compensation. */
  location: { lat: number; lon: number } | null;
  /** Defaults to `new Date()` — exposed so tests are deterministic. */
  date?: Date;
};

/**
 * Selects the best available heading source.
 *
 * Priority:
 *   1. `trueHeading` from the OS (already declination-corrected on iOS / GPS-aware Android paths).
 *   2. `magHeading` corrected by NOAA WMM declination, when location is known.
 *   3. Raw `magHeading` (uncompensated; caller must surface this as unreliable to the user).
 *
 * Returns null when no usable heading is available — caller should not update the UI.
 */
export function selectHeadingSource(
  input: HeadingSourceInput,
): { heading: number; source: 'true' | 'magnetic' } | null {
  const { trueHeading, magHeading, location, date } = input;

  if (trueHeading >= 0) {
    return { heading: trueHeading, source: 'true' };
  }
  if (magHeading < 0) {
    return null;
  }
  if (location !== null) {
    const decl = computeMagneticDeclination(location.lat, location.lon, date);
    if (decl !== null) {
      return { heading: applyDeclinationToHeading(magHeading, decl), source: 'true' };
    }
  }
  return { heading: magHeading, source: 'magnetic' };
}
