package expo.modules.compassheading

import kotlin.math.PI
import kotlin.math.abs

/**
 * Circular One Euro Filter on an azimuth (degrees). MIRROR of utils/oneEuroFilter.ts —
 * keep the two byte-for-byte equivalent; the TS jest tests are the canonical guard (this is
 * not jest-reachable). Runs on the sensor-callback thread; `minCutoff/beta/dCutoff` are written
 * from the JS thread via setTuning so they are @Volatile, while the filter STATE stays confined
 * to the sensor thread. CONTRACT: setTuning is called ONCE before the listener subscribes (no
 * mid-stream retune), so the three-field write is never observed torn by the sensor thread.
 */
class CircularOneEuroFilter(
  @Volatile var minCutoff: Double = 1.0,
  @Volatile var beta: Double = 0.02,
  @Volatile var dCutoff: Double = 1.0,
) {
  private var initialized = false
  private var lastTimeSec = 0.0
  private var lastRawDeg = 0.0
  private var unwrapped = 0.0
  private var xHat = 0.0
  private var dxHat = 0.0

  /** tSec: monotonic seconds (sensor event.timestamp / 1e9). Returns filtered azimuth [0,360). */
  fun filter(azimuthDeg: Double, tSec: Double): Double {
    if (!azimuthDeg.isFinite()) return normalize360(xHat)

    if (!initialized) {
      initialized = true
      lastTimeSec = tSec
      lastRawDeg = azimuthDeg
      unwrapped = azimuthDeg
      xHat = azimuthDeg
      dxHat = 0.0
      return normalize360(azimuthDeg)
    }

    var dt = tSec - lastTimeSec
    if (!(dt > 0.0)) dt = DEFAULT_DT_SEC
    lastTimeSec = tSec

    val delta = shortestArcDelta(azimuthDeg, lastRawDeg)
    unwrapped += delta
    lastRawDeg = azimuthDeg

    val dx = delta / dt
    val aD = smoothingFactor(dt, dCutoff)
    dxHat = aD * dx + (1.0 - aD) * dxHat

    val cutoff = minCutoff + beta * abs(dxHat)
    val aX = smoothingFactor(dt, cutoff)
    xHat = aX * unwrapped + (1.0 - aX) * xHat

    return normalize360(xHat)
  }

  /** Drop accumulated state so the next sample re-seeds (call on (re)subscribe). */
  fun reset() {
    initialized = false
    dxHat = 0.0
  }

  companion object {
    private const val DEFAULT_DT_SEC = 1.0 / 30.0

    private fun smoothingFactor(dtSec: Double, cutoffHz: Double): Double {
      val tau = 1.0 / (2.0 * PI * cutoffHz)
      return 1.0 / (1.0 + tau / dtSec)
    }

    private fun shortestArcDelta(toDeg: Double, fromDeg: Double): Double {
      var d = (((toDeg - fromDeg + 540.0) % 360.0) + 360.0) % 360.0 - 180.0
      if (d <= -180.0) d += 360.0
      return d
    }

    private fun normalize360(v: Double): Double = ((v % 360.0) + 360.0) % 360.0
  }
}
