package expo.modules.adhanplayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object AdhanAlarms {
  private fun pendingIntent(context: Context, p: ArmedPrayer): PendingIntent {
    val i = Intent(context, AdhanAlarmReceiver::class.java).apply {
      putExtra(AdhanPlaybackService.EXTRA_PRAYER_KEY, p.prayerKey)
      putExtra(AdhanPlaybackService.EXTRA_SOUND_KIND, p.soundKind)
      putExtra(AdhanPlaybackService.EXTRA_TITLE, p.title)
      putExtra(AdhanPlaybackService.EXTRA_BODY, p.body)
      putExtra(AdhanPlaybackService.EXTRA_STOP_LABEL, p.stopLabel)
    }
    return PendingIntent.getBroadcast(
      context, p.requestCode, i,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  fun arm(context: Context, prayers: List<ArmedPrayer>) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    cancel(context, AdhanScheduleStore.load(context)) // clear prior (uses their stored requestCodes)
    val now = System.currentTimeMillis()
    // Assign a stable, collision-free request code per alarm (array index)
    // instead of id.hashCode(): a hash collision would let one prayer's
    // PendingIntent silently overwrite another's → a missed adhan. (Review M2/F4)
    val future = prayers
      .filter { it.fireAtEpochMs > now }
      .mapIndexed { index, p -> p.copy(requestCode = index) }
    future.forEach { p ->
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, p.fireAtEpochMs, pendingIntent(context, p))
    }
    AdhanScheduleStore.save(context, future)
  }

  fun cancel(context: Context, prayers: List<ArmedPrayer>) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    prayers.forEach { am.cancel(pendingIntent(context, it)) }
  }

  fun cancelAll(context: Context) {
    cancel(context, AdhanScheduleStore.load(context))
    AdhanScheduleStore.clear(context)
  }

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return am.canScheduleExactAlarms()
  }
}
