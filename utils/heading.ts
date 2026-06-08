/**
 * Pure helpers for the qibla compass heading pipeline.
 *
 * Kept here (not in the hook or screen) so they can be unit-tested independently of
 * the React/native sensor stack. See rules/01-architecture.md.
 */

import { FIELD_MAX_UT, FIELD_MIN_UT, FIELD_TOLERANCE_UT, HEADING_ACCURACY } from '@/constants/qibla';

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

export type ReliabilityReason = 'interference' | 'calibrate' | null;

export type HeadingReliability = {
  /** Normalized accuracy in degrees for the footer readout; null = unknown / not shown. */
  accuracyDeg: number | null;
  quality: HeadingQuality;
  /** What the user must do to recover: move away from metal, figure-8 calibrate, or nothing. */
  reason: ReliabilityReason;
};

export type ReliabilityInput = {
  /** Primary accuracy: Android fused rotation-vector SENSOR_STATUS_* (0..3); iOS CLHeading.headingAccuracy (deg, -1 sentinel). */
  primaryAccuracy: number;
  /** RAW magnetometer SENSOR_STATUS_* (0..3) on Android; null/negative when absent (iOS / older build). */
  magAccuracy: number | null;
  /**
   * Whether magnetic interference is currently active. The CALLER computes this (via `isInterference`
   * over the measured + expected field) and applies the time hysteresis (INTERFERENCE_HOLD_MS) so a
   * field gradient does not flicker the warning — keeping this resolver pure.
   */
  interference: boolean;
};

/**
 * Whether the measured field magnitude indicates magnetic interference (a magnet/metal near the
 * phone) corrupting the heading. Region-aware: compares |B| to the expected geomagnetic intensity for
 * the location (Earth's field is ~22 µT at the magnetic equator to ~67 µT near the poles, so a single
 * global threshold is wrong); falls back to absolute sanity bounds when the expected value is unknown.
 * The fused sensor can report "high accuracy" while severely interfered (measured on-device:
 * |B| = 190 µT with accuracy = 3), so this is a SEPARATE gate from the calibration accuracy (rules/11).
 */
export function isInterference(
  fieldMicroTesla: number | null,
  expectedFieldMicroTesla: number | null,
): boolean {
  if (fieldMicroTesla === null || !Number.isFinite(fieldMicroTesla) || fieldMicroTesla <= 0) {
    return false; // no field reading (iOS / absent) → cannot judge; defer to the accuracy gate.
  }
  if (
    expectedFieldMicroTesla !== null &&
    Number.isFinite(expectedFieldMicroTesla) &&
    expectedFieldMicroTesla > 0
  ) {
    return Math.abs(fieldMicroTesla - expectedFieldMicroTesla) > FIELD_TOLERANCE_UT;
  }
  return fieldMicroTesla < FIELD_MIN_UT || fieldMicroTesla > FIELD_MAX_UT;
}

function reasonForQuality(quality: HeadingQuality): ReliabilityReason {
  return quality === 'medium' ||
    quality === 'low' ||
    quality === 'unreliable' ||
    quality === 'unknown'
    ? 'calibrate'
    : null;
}

/**
 * Resolves the trustworthy heading reliability from ALL available sensor signals, not just the fused
 * accuracy the OEM reports (which lies under interference / an uncalibrated magnetometer — rules/11).
 *
 * Android: takes the WORSE of the rotation-vector accuracy and the RAW magnetometer's calibration
 * accuracy, then overlays a field-magnitude interference gate. An uncalibrated mag → 'calibrate';
 * interference (|B| anomaly) → 'interference'; both surface as quality 'unreliable' so the UI freezes
 * the rose, suppresses the alignment cues, and shows the recovery banner.
 *
 * iOS: CLHeading fuses + calibrates internally and exposes headingAccuracy (and CoreLocation shows its
 * own figure-8 HUD); the raw field is unavailable, so we map the accuracy band only.
 */
export function resolveHeadingReliability(
  input: ReliabilityInput,
  platformOS: PlatformOS,
): HeadingReliability {
  if (platformOS === 'ios') {
    const accuracyDeg = normalizeAccuracyForPlatform(input.primaryAccuracy, 'ios');
    const quality = classifyQuality(accuracyDeg);
    return { accuracyDeg, quality, reason: reasonForQuality(quality) };
  }

  const hasMag = typeof input.magAccuracy === 'number' && input.magAccuracy >= 0;
  const level = hasMag
    ? Math.min(input.primaryAccuracy, input.magAccuracy as number)
    : input.primaryAccuracy;
  const accuracyDeg = normalizeAccuracyForPlatform(level, 'android');
  const quality = classifyQuality(accuracyDeg);

  // Uncalibrated magnetometer (SENSOR_STATUS_UNRELIABLE) → figure-8. Checked BEFORE interference so a
  // truly-uncalibrated sensor tells the user to calibrate (not "move away from metal").
  if (quality === 'unreliable' || quality === 'unknown') {
    return { accuracyDeg, quality: 'unreliable', reason: 'calibrate' };
  }

  // Interference can coexist with a "high" reported accuracy → a separate gate (caller-computed with
  // time hysteresis, so it does not flicker as the phone moves through a magnetic gradient).
  if (input.interference) {
    return { accuracyDeg: null, quality: 'unreliable', reason: 'interference' };
  }

  return { accuracyDeg, quality, reason: reasonForQuality(quality) };
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
 * EMA smoothing factor for the expo-location FALLBACK heading path (used only on devices
 * with no rotation-vector sensor; see useDeviceHeading). expo-location's Android azimuth
 * (getOrientation, accel+mag) is unfiltered and tilt-sensitive, so it needs the stronger
 * (lower) alpha to stay stable; iOS keeps the base alpha.
 *
 * The PRIMARY fused path (`modules/compass-heading`) does NOT use this — it applies the
 * light `HEADING_EMA_ALPHA` directly (spec §8), because its clean ~20ms hardware-fused
 * stream needs no extra masking. Feel-only; never affects the target angle, WMM/declination,
 * or the unreliable banner.
 */
export function headingSmoothingAlphaForPlatform(platformOS: PlatformOS, baseAlpha: number): number {
  return platformOS === 'android' ? Math.min(baseAlpha, 0.2) : baseAlpha;
}

export type HeadingPublishInput = {
  previousHeading: number | null;
  nextHeading: number;
  elapsedMs: number;
  minIntervalMs: number;
  minDeltaDeg: number;
  /**
   * Below this change vs the last published heading, treat the reading as stationary
   * and skip the publish ENTIRELY — even past the interval. Prevents the idle 8Hz
   * re-render churn (see HEADING_PUBLISH_MIN_IDLE_DELTA_DEG).
   */
  minIdleDeltaDeg: number;
};

/**
 * Decides whether a smoothed heading should cross from the sensor callback into
 * React state. EMA still consumes every raw sample; this gates the React publishes:
 *   - stationary (change < minIdleDeltaDeg) → never publish (kills idle re-render churn),
 *   - moving → publish at most every minIntervalMs, or immediately past minDeltaDeg.
 * The rose animates from the UI-thread shared value regardless, so suppressing idle
 * publishes only stops redundant whole-screen re-renders, never the compass itself.
 */
export function shouldPublishHeadingUpdate({
  previousHeading,
  nextHeading,
  elapsedMs,
  minIntervalMs,
  minDeltaDeg,
  minIdleDeltaDeg,
}: HeadingPublishInput): boolean {
  if (previousHeading === null) return true;
  const delta = Math.abs(signedDelta(nextHeading, previousHeading));
  // Stationary noise: skip even when the interval elapsed. lastPublished is not
  // advanced on a skip, so slow real rotation's sub-threshold steps accumulate and
  // eventually cross this gate — the readout still tracks, it just stops re-rendering
  // the screen ~8x/s to show an identical heading while the phone sits still.
  if (delta < minIdleDeltaDeg) return false;
  if (elapsedMs >= minIntervalMs) return true;
  return delta >= minDeltaDeg;
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

export type RoseSpringConfig = {
  mass: number;
  stiffness: number;
  damping: number;
  /** Hard-clamp at the target so velocity inherited on re-target can never glide past it. */
  overshootClamping: boolean;
};

/**
 * Reanimated spring config for the compass-rose retarget (Qibla bug A2 regression fix).
 *
 * The rose target is re-assigned at sensor rate (~30Hz). Reanimated seeds each new spring with
 * the running spring's CURRENT velocity, so a bouncy spring keeps gliding when the heading stream
 * stalls — the on-device coast/overshoot ("döndürmeyi bıraktım hâlâ döndü", kept rotating after I
 * stopped). We therefore pick an OVERDAMPED spring — zeta = damping / (2·√(stiffness·mass)) =
 * 26/20 = 1.3 > 1, so it never oscillates — AND `overshootClamping: true` (hard safety net: any
 * residual velocity is clamped at the target). Together they smooth the irregular ~30Hz cadence —
 * bridging the gaps the prior momentum-free `withTiming` left as visible "stepping" — WITHOUT
 * reintroducing the coast A2 removed. Physics branch (mass/stiffness/damping) is
 * reanimated-major-version-safe; confirmed against the Reanimated docs (Context7). Feel-only:
 * never affects the target angle, WMM/declination, or the unreliable banner (rules/11).
 */
export function roseSpringConfig(): RoseSpringConfig {
  return { mass: 1, stiffness: 100, damping: 26, overshootClamping: true };
}

/**
 * One UI-thread frame of the compass-rose follow: eases `displayed` a fraction of the way
 * toward `target` (both UNBOUNDED accumulated rotations, so this is plain linear math that
 * never sees the 0/360 seam — the shortest-arc unwrap happens upstream at ingest).
 *
 * `next = displayed + (target − displayed)·(1 − e^(−λ·dt))`
 *
 * Why this shape (vs the old per-sample `withSpring` retarget):
 * - **Runs every vsync**, not per sensor sample → the rose advances on every frame even when
 *   samples are sparse (slow rotation), turning the old freeze-then-jump into a smooth glide.
 * - **Cannot overshoot**: the eased fraction `(1 − e^(−λ·dt))` is in `[0, 1)` for `dt ≥ 0`, so
 *   the result is always on the segment `[displayed, target]`. No momentum term ⇒ the A2
 *   coast/overshoot regression is impossible by construction.
 * - **Exactly frame-rate independent**: exponential decay is multiplicative, so two `dt/2`
 *   steps equal one `dt` step → identical feel on 60/90/120 Hz panels (device-agnostic).
 *
 * `dt` is clamped to `[0, maxDtSec]` so a background/foreground gap (one huge frame) can't snap
 * the rose. Pure + deterministic for unit testing; the worklet that calls it (QiblaCompass) is
 * itself device-verified (the reanimated jest mock skips frame callbacks).
 *
 * `lambda` and `maxDtSec` are REQUIRED args (not module constants referenced inside) ON PURPOSE:
 * this runs as a worklet, and a worklet does NOT reliably capture cross-module imported constants
 * into its closure — on-device this threw `ReferenceError: Property 'ROSE_FOLLOW_LAMBDA' doesn't
 * exist` every vsync (a default-param `= ROSE_FOLLOW_LAMBDA` is not scanned into the __closure).
 * So the constants are passed in from the CALLER's worklet (QiblaCompass), where the import IS
 * captured; this function's closure stays empty (only params + Math.* UI globals) = always safe.
 */
export function roseFollowStep(
  displayed: number,
  target: number,
  dtSec: number,
  lambda: number,
  maxDtSec: number,
): number {
  // CRITICAL: called synchronously from the QiblaCompass useFrameCallback worklet (UI thread).
  // The 'worklet' directive gives it a __workletHash so it is callable there (without it the
  // plugin serializes it as a RemoteFunction → "Tried to synchronously call a non-worklet
  // function" every vsync). It stays a normal JS callable for the unit tests. Do NOT remove, and
  // do NOT reference module-imported constants in here (see the doc comment — closure capture).
  'worklet';
  const dt = Math.min(Math.max(dtSec, 0), maxDtSec);
  return displayed + (target - displayed) * (1 - Math.exp(-lambda * dt));
}

function normalize360(v: number): number {
  return ((v % 360) + 360) % 360;
}
