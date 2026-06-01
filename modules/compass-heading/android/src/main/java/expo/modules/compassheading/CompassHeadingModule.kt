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
  private var lastAccuracy: Int = SensorManager.SENSOR_STATUS_ACCURACY_HIGH
  private val rotationMatrix = FloatArray(9)
  private val orientation = FloatArray(3)

  private val listener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
      SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
      SensorManager.getOrientation(rotationMatrix, orientation)
      val azimuthDeg = (Math.toDegrees(orientation[0].toDouble()) + 360.0) % 360.0
      sendEvent(
        "onHeading",
        mapOf(
          "trueHeading" to -1.0,
          "magHeading" to azimuthDeg,
          "accuracy" to lastAccuracy,
        ),
      )
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
      lastAccuracy = accuracy
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
