/**
 * Pure helpers for the qibla compass heading pipeline.
 *
 * Kept here (not in the hook or screen) so they can be unit-tested independently of
 * the React/native sensor stack. See rules/01-architecture.md.
 */

import { HEADING_ACCURACY } from '@/constants/qibla';

export type HeadingQuality = 'high' | 'medium' | 'low' | 'unreliable' | 'unknown';

/** OS string compatible with React Native's `Platform.OS`. We accept the union explicitly so utils stay free of `react-native` imports. */
export type PlatformOS = 'ios' | 'android' | 'web' | 'windows' | 'macos';

/**
 * Bucket a normalized accuracy (degrees) into a qualitative band the UI can act on.
 * `null` collapses to `'unknown'` — we never silently treat it as "high".
 */
export function classifyQuality(accuracyDeg: number | null): HeadingQuality {
  if (accuracyDeg === null) return 'unknown';
  if (accuracyDeg <= HEADING_ACCURACY.goodMaxDeg) return 'high';
  if (accuracyDeg <= HEADING_ACCURACY.warnMaxDeg) return 'medium';
  if (accuracyDeg <= HEADING_ACCURACY.lowMaxDeg) return 'low';
  return 'unreliable';
}

/**
 * Whether a heading quality should suppress alignment indicators (halo, haptic, ring).
 * `'unknown'` is included: no signal is worse than a wrong "you are aligned" signal —
 * see religious-accuracy memory.
 */
export function isUnreliable(quality: HeadingQuality): boolean {
  return quality === 'unreliable' || quality === 'unknown';
}

/**
 * Whether the qibla compass should render the alignment halo and Kaaba ring.
 *
 * Even after the alignment hysteresis has latched on, an unreliable heading must
 * suppress the visual "you are facing qibla" cue — otherwise the user sees a
 * confident green ring drawn on noise.
 */
export function showAlignmentVisuals(aligned: boolean, unreliable: boolean): boolean {
  return aligned && !unreliable;
}

/**
 * Cross-platform normalization of the heading accuracy reading exposed by expo-location.
 *
 * iOS reports `CLHeading.headingAccuracy` directly in degrees (with -1 sentinel before first calibration).
 * Android passes through `SensorManager` accuracy levels (0..3) where:
 *   - 0 = SENSOR_STATUS_UNRELIABLE — must be surfaced as "unreliable", not "perfect 0°".
 *   - 1 = LOW, 2 = MEDIUM, 3 = HIGH.
 *
 * Returning `null` means "do not show a quality value" (caller must classify as unknown).
 */
export function normalizeAccuracyForPlatform(
  value: number | null | undefined,
  platformOS: PlatformOS,
): number | null {
  if (value === null || value === undefined) return null;
  if (platformOS === 'ios') {
    if (value < 0) return null;
    return value;
  }
  // Android (and any non-iOS) interprets value as a SENSOR_STATUS_* level.
  if (value < 0) return null;
  if (value >= 3) return 5;
  if (value >= 2) return 15;
  if (value >= 1) return 30;
  // value === 0 → SENSOR_STATUS_UNRELIABLE. Force above lowMaxDeg so classifyQuality
  // returns 'unreliable'. Without this the UI would treat it as the most precise reading.
  return 999;
}

/**
 * Exponential moving average with shortest-arc handling for circular angles.
 *
 * The smoothing must operate on the shorter of the two arcs between prev and raw,
 * otherwise crossing 0/360 (e.g. 359° → 1°) would average to ~180° instead of 0°.
 *
 * @param prev   Previous smoothed value in [0, 360), or null for first reading.
 * @param raw    Latest raw heading in [0, 360).
 * @param alpha  Smoothing factor in (0, 1]; higher = more responsive, less filtered.
 * @returns      New smoothed heading in [0, 360).
 */
export function applyEma(prev: number | null, raw: number, alpha: number): number {
  if (prev === null) return normalize360(raw);
  let delta = raw - prev;
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  const next = prev + alpha * delta;
  return normalize360(next);
}

/**
 * Adaptive EMA factor for the heading low-pass filter.
 *
 * iOS heading is already OS-smoothed → use baseAlpha. Android's raw azimuth
 * (expo-location getOrientation) is UNFILTERED, and a single fixed alpha cannot win:
 * a low alpha kills the stationary jitter but lags badly on a fast turn (a quick 360°
 * spin leaves the needle at a stale/WRONG bearing until it catches up — confirmed on
 * a Galaxy A30s), while a high alpha tracks turns but lets the needle shake when still.
 *
 * So alpha tracks the motion: near-stationary (small per-sample delta) → baseAlpha
 * (heavy smoothing, stable needle); fast turn (large delta) → ~0.9 (near-raw, minimal
 * lag); linear ramp between. `rawDeltaDeg` is the raw sample's shortest-arc change from
 * the current smoothed value.
 */
export function headingEmaAlpha(
  platformOS: PlatformOS,
  rawDeltaDeg: number,
  baseAlpha: number,
): number {
  if (platformOS !== 'android') return baseAlpha;
  const STILL_DEG = 3;
  const FAST_DEG = 30;
  const FAST_ALPHA = 0.9;
  const m = Math.abs(rawDeltaDeg);
  if (m <= STILL_DEG) return baseAlpha;
  if (m >= FAST_DEG) return FAST_ALPHA;
  return baseAlpha + ((m - STILL_DEG) / (FAST_DEG - STILL_DEG)) * (FAST_ALPHA - baseAlpha);
}

export type HeadingPublishInput = {
  previousHeading: number | null;
  nextHeading: number;
  elapsedMs: number;
  minIntervalMs: number;
  minDeltaDeg: number;
};

/**
 * Decides whether a smoothed heading should cross from the sensor callback into
 * React state. EMA still consumes every raw sample; this only drops tiny burst
 * publishes that make release APK rendering fight with Reanimated animations.
 */
export function shouldPublishHeadingUpdate({
  previousHeading,
  nextHeading,
  elapsedMs,
  minIntervalMs,
  minDeltaDeg,
}: HeadingPublishInput): boolean {
  if (previousHeading === null) return true;
  if (elapsedMs >= minIntervalMs) return true;
  return Math.abs(signedDelta(nextHeading, previousHeading)) >= minDeltaDeg;
}

/**
 * Signed shortest-arc difference (a − b) wrapped to (−180, 180].
 *
 * Positive result means `a` is clockwise of `b`; negative means counter-clockwise.
 * Used by the compass to decide whether the user should rotate the phone left or right.
 */
export function signedDelta(a: number, b: number): number {
  let d = ((a - b + 540) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Shortest signed delta to add to `current` to land on a value angularly equivalent
 * to `target` modulo 360, in (−180, 180].
 *
 * Used to drive an animated rotation that is allowed to grow unboundedly (so a
 * generic numeric tween follows the short arc). Without this, animating between
 * two normalized headings across the 0/360 seam (e.g. −359° → −1°) would interpolate
 * 358° the wrong way, visibly spinning the compass rose almost a full turn.
 *
 * Example: current = −359, target = −1 → delta = −2 (so next = −361, visually = −1).
 */
export function shortestRotationDelta(current: number, target: number): number {
  let d = ((target - current) % 360 + 540) % 360 - 180;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Advances a monotonically-accumulated compass-rose rotation target toward the
 * angle that renders the device facing `deviceHeadingDeg`. The rose rotates by
 * −heading (so geographic north on the rose stays under true north as the phone
 * turns); the target stays UNBOUNDED and moves along the shortest signed arc so a
 * numeric tween never spins the long way across the 0/360 seam.
 *
 * Pure + deterministic: the caller keeps `prevTargetDeg` in a JS ref and feeds it
 * back in, so the animation target never depends on reading a mid-flight Reanimated
 * shared value on the JS thread (which blocks the thread and yields a racing
 * baseline — the cause of the on-device rose stutter).
 */
export function nextRoseRotation(prevTargetDeg: number, deviceHeadingDeg: number): number {
  return prevTargetDeg + shortestRotationDelta(prevTargetDeg, -deviceHeadingDeg);
}

export function roseTweenDurationMs(deltaDeg: number): number {
  // expo-location delivers the Android heading in ~2° steps (native ~2°/50ms gate),
  // so a short tween finishes between steps and the rose visibly "steps" instead of
  // gliding (which, while the needle sits at a stale angle, also reads as a WRONG
  // bearing). Use a long duration for small per-step deltas so the tween is still
  // animating when the next step arrives — Reanimated then re-targets it into ONE
  // continuous glide on the UI thread, independent of React re-render jank. Large
  // deltas (fast turns / N-seam crossing) keep a shorter duration to stay responsive.
  const magnitude = Math.abs(deltaDeg);
  if (magnitude >= 90) return 70;
  if (magnitude >= 45) return 110;
  if (magnitude >= 12) return 200;
  return 300;
}

function normalize360(v: number): number {
  return ((v % 360) + 360) % 360;
}
