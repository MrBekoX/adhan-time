package expo.modules.adhanplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AdhanBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED -> {
        val armed = AdhanScheduleStore.load(context)
        if (armed.isNotEmpty()) AdhanAlarms.arm(context, armed)
      }
    }
  }
}
