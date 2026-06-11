package expo.modules.batteryoptimization

import android.content.Context
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BatteryOptimizationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BatteryOptimization")

    // Synchronous: PowerManager read is cheap and the caller needs it inline
    // while building the register-device payload. No permission required.
    Function("isIgnoringBatteryOptimizations") {
      val ctx: Context = appContext.reactContext ?: return@Function false
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
        ?: return@Function false
      pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }
  }
}
