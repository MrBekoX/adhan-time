package expo.modules.adhanplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class AdhanAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val svc = Intent(context, AdhanPlaybackService::class.java).apply {
      putExtra(AdhanPlaybackService.EXTRA_PRAYER_KEY, intent.getStringExtra(AdhanPlaybackService.EXTRA_PRAYER_KEY))
      putExtra(AdhanPlaybackService.EXTRA_SOUND_KIND, intent.getStringExtra(AdhanPlaybackService.EXTRA_SOUND_KIND))
      putExtra(AdhanPlaybackService.EXTRA_TITLE, intent.getStringExtra(AdhanPlaybackService.EXTRA_TITLE))
      putExtra(AdhanPlaybackService.EXTRA_BODY, intent.getStringExtra(AdhanPlaybackService.EXTRA_BODY))
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(svc)
    } else {
      context.startService(svc)
    }
  }
}
