package expo.modules.compassheading

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CompassHeadingModule : Module() {
  private var sensorManager: SensorManager? = null
  private val rotationMatrix = FloatArray(9)
  private val orientation = FloatArray(3)

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
      // Read accuracy PER-EVENT from SensorEvent.accuracy (SENSOR_STATUS_*). We must not seed
      // an optimistic "high" default before the first reading: emitting a confident accuracy
      // on an uncalibrated magnetometer is a false-correct qibla signal (rules/11). Values 0
      // (UNRELIABLE) and -1 (NO_CONTACT) both map downstream to the unreliable band.
      sendEvent(
        "onHeading",
        mapOf(
          "trueHeading" to -1.0,
          "magHeading" to azimuthDeg,
          "accuracy" to event.accuracy,
        ),
      )
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
      // No-op: accuracy is read per-event from SensorEvent.accuracy in onSensorChanged.
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
      sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
    }

    OnStopObserving {
      sensorManager?.unregisterListener(listener)
      sensorManager = null
    }
  }
}
