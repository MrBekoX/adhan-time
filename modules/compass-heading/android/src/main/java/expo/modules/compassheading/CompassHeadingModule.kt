package expo.modules.compassheading

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CompassHeadingModule : Module() {
  private var sensorManager: SensorManager? = null
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
  // THREADING: these fields are confined to the sensor-callback thread (onSensorChanged). The reset
  // in OnStartObserving runs BEFORE registerListener(), so registerListener() publishes the reset to
  // the sensor thread (happens-before) — hence no @Volatile needed for these primitive fields.
  private var lastEmitNanos = 0L
  private var lastAccuracy = Int.MIN_VALUE

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

      // Accuracy is read PER-EVENT from SensorEvent.accuracy (SENSOR_STATUS_*). Values 0
      // (UNRELIABLE) and -1 (NO_CONTACT) map downstream to the unreliable band. A quality/
      // calibration transition must reach JS promptly so the red calibration banner / unreliable
      // state flips without waiting for the time gate (rules/11) — so an accuracy change BYPASSES
      // the time gate below. Otherwise cap emits at ~30Hz (the SOLE gate — no angular gate, which
      // is what froze slow rotation; see the throttle-state note above).
      if (event.accuracy == lastAccuracy &&
        event.timestamp - lastEmitNanos < MIN_EMIT_INTERVAL_NANOS
      ) {
        return
      }

      lastAccuracy = event.accuracy
      lastEmitNanos = event.timestamp

      // Bundle (not mapOf): avoids the internal Map->Bundle copy + the Pair/vararg churn;
      // putDouble/putInt take primitives. Fresh Bundle per emit — reusing one races the
      // cross-thread JSI reader (the payload is not contractually deep-copied before sendEvent
      // returns). trueHeading is -1 on Android (magnetic-referenced); the JS WMM path converts to
      // true north — never add declination natively (rules/11).
      sendEvent(
        "onHeading",
        Bundle().apply {
          putDouble("trueHeading", -1.0)
          putDouble("magHeading", azimuthDeg)
          putInt("accuracy", event.accuracy)
        },
      )
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
      // No-op: accuracy is read per-event from SensorEvent.accuracy in onSensorChanged, which
      // emits immediately when it changes (the throttle bypass above).
    }
  }

  // Hardware-fused (accel+gyro+mag); GEOMAGNETIC variant (gyro-free, still fused) is the
  // fallback for devices without a gyroscope.
  private fun resolveSensor(sm: SensorManager): Sensor? =
    sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
      ?: sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)

  override fun definition() = ModuleDefinition {
    Name("CompassHeading")

    Events("onHeading")

    Function("isAvailable") {
      val sm = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      sm != null && resolveSensor(sm) != null
    }

    OnStartObserving {
      val ctx = appContext.reactContext ?: return@OnStartObserving
      val sm = ctx.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        ?: return@OnStartObserving
      val sensor = resolveSensor(sm) ?: return@OnStartObserving
      sensorManager = sm
      // Reset throttle so the first reading after (re)subscribe emits immediately (no gate delay).
      lastEmitNanos = 0L
      lastAccuracy = Int.MIN_VALUE
      // Request ~30Hz at the source (samplingPeriodUs) instead of SENSOR_DELAY_GAME (~50Hz): trims
      // the firehose at the HAL. It is only a hint (devices commonly over-deliver), so the in-handler
      // gates above enforce the real ~30Hz ceiling.
      sm.registerListener(listener, sensor, SENSOR_SAMPLING_PERIOD_US)
    }

    OnStopObserving {
      sensorManager?.unregisterListener(listener)
      sensorManager = null
    }
  }

  companion object {
    // ~30Hz request at the sensor source (33,333µs). Hint only; the gates below are the ceiling.
    private const val SENSOR_SAMPLING_PERIOD_US = 33_333
    // Hard emit ceiling ~30Hz (33ms in sensor-clock nanos) regardless of device over-delivery.
    private const val MIN_EMIT_INTERVAL_NANOS = 33_000_000L
  }
}
