package expo.modules.adhanplayer

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AdhanPlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AdhanPlayer")

    // Idempotent: clears any prior alarms and arms the supplied set. Driven by
    // notificationScheduler.reconcile() on Android when the adhan sound pref is on.
    AsyncFunction("armPrayers") { prayers: List<Map<String, Any>> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      val parsed = prayers.map {
        ArmedPrayer(
          id = it["id"] as String,
          prayerKey = it["prayerKey"] as String,
          fireAtEpochMs = (it["fireAtEpochMs"] as Number).toLong(),
          soundKind = it["soundKind"] as String,
          title = it["title"] as String,
          body = it["body"] as String,
        )
      }
      AdhanAlarms.arm(ctx, parsed)
    }

    AsyncFunction("cancelAll") {
      appContext.reactContext?.let { AdhanAlarms.cancelAll(it) }
    }

    Function("stopPlayback") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        ctx.startService(
          Intent(ctx, AdhanPlaybackService::class.java).apply {
            action = AdhanPlaybackService.ACTION_STOP
          },
        )
      }
    }

    Function("canScheduleExactAlarms") {
      appContext.reactContext?.let { AdhanAlarms.canScheduleExact(it) } ?: false
    }

    Function("openExactAlarmSettings") {
      val ctx = appContext.reactContext
      if (ctx != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        ctx.startActivity(
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
            .setData(Uri.parse("package:${ctx.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
    }

    Function("isIgnoringBatteryOptimizations") {
      val ctx = appContext.reactContext ?: return@Function false
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    Function("requestIgnoreBatteryOptimizations") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        ctx.startActivity(
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:${ctx.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
    }
  }
}
