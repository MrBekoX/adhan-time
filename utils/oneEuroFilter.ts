/**
 * Circular One Euro Filter (Casiez et al. 2012) for azimuth smoothing.
 *
 * This is the CANONICAL implementation: the Kotlin `CircularOneEuroFilter`
 * (modules/compass-heading/.../OneEuroFilter.kt) mirrors it byte-for-byte in behaviour.
 * The native path is the one that runs in production (jest has no native runtime), so these
 * tests are the only automated guard on the algorithm — keep the two in sync.
 *
 * Adaptive: at low angular speed the cutoff drops (heavy smoothing → kills idle jitter); at
 * high speed it rises (light smoothing → tracks fast motion without lag). Operates on an
 * UNWRAPPED azimuth (accumulated shortest-arc deltas) so the 0/360 seam never averages to 180.
 */

export type OneEuroParams = {
  /** Cutoff (Hz) at ~zero speed. Lower = smoother/more lag at rest. */
  minCutoff: number;
  /** Speed coefficient. Higher = less lag during fast motion. */
  beta: number;
  /** Cutoff (Hz) for the derivative (speed) low-pass. Usually 1.0. */
  dCutoff: number;
};

export type CircularOneEuro = {
  /** Feed a raw azimuth [0,360) at monotonic time `tSec`; returns the smoothed azimuth [0,360). */
  filter: (azimuthDeg: number, tSec: number) => number;
};

const DEFAULT_DT_SEC = 1 / 30;

function smoothingFactor(dtSec: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

function shortestArcDelta(toDeg: number, fromDeg: number): number {
  let d = (((toDeg - fromDeg + 540) % 360) + 360) % 360 - 180;
  if (d <= -180) d += 360;
  return d;
}

function normalize360(v: number): number {
  return ((v % 360) + 360) % 360;
}

export function makeCircularOneEuro(params: OneEuroParams): CircularOneEuro {
  let initialized = false;
  let lastTimeSec = 0;
  let lastRawDeg = 0;
  let unwrapped = 0;
  let xHat = 0;
  let dxHat = 0;

  return {
    filter(azimuthDeg, tSec) {
      if (!Number.isFinite(azimuthDeg)) return normalize360(xHat);

      if (!initialized) {
        initialized = true;
        lastTimeSec = tSec;
        lastRawDeg = azimuthDeg;
        unwrapped = azimuthDeg;
        xHat = azimuthDeg;
        dxHat = 0;
        return normalize360(azimuthDeg);
      }

      let dt = tSec - lastTimeSec;
      if (!(dt > 0)) dt = DEFAULT_DT_SEC; // non-monotonic / duplicate timestamp guard
      lastTimeSec = tSec;

      const delta = shortestArcDelta(azimuthDeg, lastRawDeg);
      unwrapped += delta;
      lastRawDeg = azimuthDeg;

      const dx = delta / dt; // deg/s
      const aD = smoothingFactor(dt, params.dCutoff);
      dxHat = aD * dx + (1 - aD) * dxHat;

      const cutoff = params.minCutoff + params.beta * Math.abs(dxHat);
      const aX = smoothingFactor(dt, cutoff);
      xHat = aX * unwrapped + (1 - aX) * xHat;

      return normalize360(xHat);
    },
  };
}
