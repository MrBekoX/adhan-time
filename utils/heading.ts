/**
 * Pure helpers for the qibla compass heading pipeline.
 *
 * Kept here (not in the hook or screen) so they can be unit-tested independently of
 * the React/native sensor stack. See rules/01-architecture.md.
 */

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

function normalize360(v: number): number {
  return ((v % 360) + 360) % 360;
}
