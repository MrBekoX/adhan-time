package expo.modules.compassheading

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs

class CompassHeadingModule : Module() {
  private var sensorManager: SensorManager? = null
  private var sensorThread: HandlerThread? = null
  private var sensorHandler: Handler? = null
  @Volatile private var observing = false
  private val rotationMatrix = FloatArray(9)
  private val orientation = FloatArray(3)

  // Emit throttle state. We cap emissions at ~30Hz (MIN_EMIT_INTERVAL_NANOS) to bound the
  // fresh-Bundle + JSI-bridge cost. There is intentionally NO per-sample angular gate: a
  // displacement gate (emit only if azimuth moved >= T° vs the last emitted value) quantizes the
  // stream into T°-sized steps whose cadence is T / angular_velocity, so at fine qibla-alignment
  // speed (~0.3°/s) it collapsed to ~1 emit/s and froze the rose for ~1s before it jumped. "30Hz
  // REGULAR >> irregular": a steady stream is what the JS-side per-frame follow (roseFollowStep) +
  // EMA need to glide smoothly. Idle cost of a steady 30Hz while the (foreground-only) screen is
  // open is ~1 GC / 6 min — acceptable; the display idles via the follow's self-disarm. Spec:
  // docs/superpowers/specs/2026-06-05-qibla-slow-rotation-freeze-fix-design.md §7.1
  //
  // THREADING: these fields are confined to CompassHeadingSensor (onSensorChanged). The reset in
  // OnStartObserving runs BEFORE registerListener(..., sensorHandler), so registerListener publishes
  // the reset to the sensor thread (happens-before) — hence no @Volatile needed for these fields.
  private var lastEmitNanos = 0L
  private var lastAccuracy = Int.MIN_VALUE

  // Raw-glitch reject state (sensor thread only — same happens-before as the throttle fields above).
  // Some rotation-vector HALs emit a single physically-impossible azimuth sample (measured up to
  // ~56° in one ~20ms step ≈ 2800°/s on a Galaxy A30). One Euro is speed-adaptive, so it reads that
  // spike's huge velocity as "fast motion", opens its cutoff and PASSES it → a visible jump. We drop
  // such a sample at the SOURCE (before the filter) when its angular RATE vs the previous ACCEPTED
  // raw sample exceeds a hand-impossible ceiling. This is NOT the displacement gate the throttle
  // comment warns against: that quantized ALL motion by ANGLE (and froze slow turns); this rejects
  // ONLY by RATE and ONLY physically-impossible spikes, so every real sweep (≤~1000°/s) passes
  // untouched. A consecutive-reject cap guarantees it can never freeze the rose (real motion re-seeds).
  private var lastRawDeg = 0.0
  private var lastRawNanos = 0L
  private var consecutiveGlitchRejects = 0

  // RAW magnetometer signals (a SEPARATE TYPE_MAGNETIC_FIELD sensor) for interference + calibration
  // detection (rules/11). The FUSED rotation-vector accuracy stays "high" under magnetic interference
  // and even with an uncalibrated magnetometer (measured on-device: |B|=190µT at a desk with
  // accuracy=3, heading garbage), so it cannot be trusted alone. We read the raw magnetometer's own
  // calibration accuracy + field magnitude |B| and let the JS resolve reliability. Sensor-thread
  // confined: magListener is registered on the SAME Handler as the rotation-vector listener, so all
  // callbacks serialize on one thread (same happens-before as the throttle fields above).
  private var magAccuracy = -1
  private var fieldMicroTesla = -1.0

  private val headingFilter = CircularOneEuroFilter()

  private val listener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
      // A few OEM rotation-vector sensors emit malformed event.values; skip that sample
      // instead of letting getRotationMatrixFromVector throw on the sensor thread.
      try {
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
      } catch (e: IllegalArgumentException) {
        return
      }
      SensorManager.getOrientation(rotationMatrix, orientation)
      val azimuthDeg = (Math.toDegrees(orientation[0].toDouble()) + 360.0) % 360.0
      // Drop a NaN azimuth on the sensor thread so it never crosses the bridge. A malformed
      // rotation vector yields NaN WITHOUT throwing above; a NaN magHeading would survive the JS
      // `magHeading < 0` check (NaN < 0 is false) and poison the persisted EMA permanently — a
      // frozen heading is a religious-accuracy failure (rules/11). Native is not OTA-patchable, so
      // this guard must live here.
      if (azimuthDeg.isNaN()) return

      // Raw-glitch reject (see field comment). Skip a single physically-impossible sample so the One
      // Euro never sees its velocity; keep lastRaw* UNCHANGED so the next real sample is measured from
      // the pre-glitch reference. The consecutive cap means even a sustained high-rate region (which a
      // hand cannot produce) re-seeds after a few drops instead of freezing the rose forever.
      if (lastRawNanos != 0L) {
        val dtSec = (event.timestamp - lastRawNanos) / 1_000_000_000.0
        if (dtSec > 0.0) {
          var rawDelta = (((azimuthDeg - lastRawDeg + 540.0) % 360.0) + 360.0) % 360.0 - 180.0
          if (rawDelta <= -180.0) rawDelta += 360.0
          val rateDegPerSec = abs(rawDelta) / dtSec
          if (rateDegPerSec > MAX_AZIMUTH_RATE_DEG_S &&
            consecutiveGlitchRejects < MAX_CONSECUTIVE_GLITCH_REJECTS
          ) {
            consecutiveGlitchRejects += 1
            Log.w(
              TAG,
              "rejected glitch raw=%.1f prev=%.1f delta=%.1f rate=%.0f deg/s"
                .format(azimuthDeg, lastRawDeg, rawDelta, rateDegPerSec),
            )
            return
          }
        }
      }
      consecutiveGlitchRejects = 0
      lastRawDeg = azimuthDeg
      lastRawNanos = event.timestamp

      // Filter EVERY sample (builds the One Euro state); dt comes from the real sensor clock.
      val tSec = event.timestamp / 1_000_000_000.0
      val filteredDeg = headingFilter.filter(azimuthDeg, tSec)

      if (event.accuracy == lastAccuracy &&
        event.timestamp - lastEmitNanos < MIN_EMIT_INTERVAL_NANOS
      ) {
        return
      }

      lastAccuracy = event.accuracy
      lastEmitNanos = event.timestamp

      emitHeading(filteredDeg, event.accuracy)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
      // No-op: accuracy is read per-event from SensorEvent.accuracy in onSensorChanged, which
      // emits immediately when it changes (the throttle bypass above).
    }
  }

  // RAW magnetometer listener (separate sensor, same Handler/thread). Tracks the magnetometer's own
  // calibration accuracy (SENSOR_STATUS_*) and field magnitude |B| (µT) for interference detection.
  private val magListener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
      val x = event.values[0].toDouble()
      val y = event.values[1].toDouble()
      val z = event.values[2].toDouble()
      val magnitude = Math.sqrt(x * x + y * y + z * z)
      if (magnitude.isFinite()) fieldMicroTesla = magnitude
      magAccuracy = event.accuracy
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
      magAccuracy = accuracy
    }
  }

  // Hardware-fused (accel+gyro+mag); GEOMAGNETIC variant (gyro-free, still fused) is the
  // fallback for devices without a gyroscope.
  private fun resolveSensor(sm: SensorManager): Sensor? =
    sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
      ?: sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)

  private fun resolveMagnetometer(sm: SensorManager): Sensor? =
    sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)

  private fun emitHeading(filteredDeg: Double, accuracy: Int) {
    if (!observing) return

    val payload = Bundle().apply {
      putDouble("trueHeading", -1.0)
      putDouble("magHeading", filteredDeg)
      putInt("accuracy", accuracy)
      putInt("magAccuracy", magAccuracy)
      putDouble("fieldMicroTesla", fieldMicroTesla)
    }

    appContext.executeOnJavaScriptThread(
      Runnable {
        if (observing) {
          sendEvent("onHeading", payload)
        }
      },
    )
  }

  private fun stopSensorThread() {
    observing = false
    sensorManager?.unregisterListener(listener)
    sensorManager?.unregisterListener(magListener)
    sensorManager = null
    sensorHandler?.removeCallbacksAndMessages(null)
    sensorHandler = null
    sensorThread?.quitSafely()
    sensorThread = null
  }

  override fun definition() = ModuleDefinition {
    Name("CompassHeading")

    Events("onHeading")

    Function("isAvailable") {
      val sm = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      sm != null && resolveSensor(sm) != null
    }

    Function("setTuning") { minCutoff: Double, beta: Double, dCutoff: Double ->
      headingFilter.minCutoff = minCutoff
      headingFilter.beta = beta
      headingFilter.dCutoff = dCutoff
    }

    OnStartObserving {
      val ctx = appContext.reactContext ?: return@OnStartObserving
      val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        ?: return@OnStartObserving
      val sensor = resolveSensor(sm) ?: return@OnStartObserving
      stopSensorThread()
      sensorManager = sm
      // Reset throttle + glitch-reject state so the first reading after (re)subscribe emits
      // immediately (no gate delay) and is never measured against a stale pre-blur reference.
      lastEmitNanos = 0L
      lastAccuracy = Int.MIN_VALUE
      lastRawDeg = 0.0
      lastRawNanos = 0L
      consecutiveGlitchRejects = 0
      magAccuracy = -1
      fieldMicroTesla = -1.0
      headingFilter.reset()
      // Deliver sensor callbacks on a dedicated HandlerThread (NOT the main/UI thread). Without an
      // explicit Handler, registerListener posts onSensorChanged to the main looper, so the matrix
      // math + One Euro filter + JS-bridge ran on the UI thread at ~50Hz and starved Reanimated's
      // rose follow on that same thread → freeze-then-jump on low-end devices. Off-main delivery +
      // executeOnJavaScriptThread (emitHeading) keeps the UI thread free for rendering.
      val thread = HandlerThread(SENSOR_THREAD_NAME).apply { start() }
      val handler = Handler(thread.looper)
      sensorThread = thread
      sensorHandler = handler
      // Set observing only AFTER a successful registration: callbacks are posted to `handler`
      // (so flipping the flag here can't miss an event), and a failed registration never leaves
      // observing=true with a half-torn-down thread.
      if (sm.registerListener(listener, sensor, SENSOR_SAMPLING_PERIOD_US, handler)) {
        observing = true
        // Also observe the RAW magnetometer (interference + calibration) on the SAME Handler. Best
        // effort: if it is absent, magAccuracy stays -1 and JS falls back to the rotation-vector.
        resolveMagnetometer(sm)?.let { mag ->
          sm.registerListener(magListener, mag, MAG_SAMPLING_PERIOD_US, handler)
        }
      } else {
        stopSensorThread()
      }
    }

    OnStopObserving {
      stopSensorThread()
    }
  }

  companion object {
    private const val TAG = "CompassHeading"
    private const val SENSOR_THREAD_NAME = "CompassHeadingSensor"
    // ~30Hz request at the sensor source (33,333µs). Hint only; the gates below are the ceiling.
    private const val SENSOR_SAMPLING_PERIOD_US = 33_333
    // RAW magnetometer sample rate for interference/calibration detection — ~10Hz is ample (|B| and
    // the calibration accuracy change slowly), keeping the extra sensor off the hot path.
    private const val MAG_SAMPLING_PERIOD_US = 100_000
    // Hard emit ceiling ~30Hz (33ms in sensor-clock nanos) regardless of device over-delivery.
    private const val MIN_EMIT_INTERVAL_NANOS = 33_000_000L
    // Raw-glitch reject ceiling. A handheld phone tops out well under ~1000°/s even on a fast wrist
    // flick; rotation-vector glitches measured ~2800°/s (56° in ~20ms). 1500°/s sits clearly above
    // any human motion and below the glitch band, so it rejects spikes without ever clipping a real
    // sweep. NOT OTA-tunable on purpose (native source guard); the Log.w above reports each hit so
    // the value can be validated/retuned from device logcat.
    private const val MAX_AZIMUTH_RATE_DEG_S = 1500.0
    // Never reject more than this many in a row → if a device genuinely sustains a high rate, real
    // motion re-seeds instead of the rose freezing forever (religious-accuracy safety, rules/11).
    private const val MAX_CONSECUTIVE_GLITCH_REJECTS = 3
  }
}
