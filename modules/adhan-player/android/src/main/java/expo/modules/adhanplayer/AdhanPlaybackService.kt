package expo.modules.adhanplayer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder

class AdhanPlaybackService : Service() {
  private var player: MediaPlayer? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopPlaybackAndSelf()
      return START_NOT_STICKY
    }
    // Normalize soundKind to the closed set {fajr, regular} at the boundary;
    // the raw resource names below are hard-coded literals and are NEVER
    // interpolated from this extra. (Security F2)
    val soundKind = if (intent?.getStringExtra(EXTRA_SOUND_KIND) == "fajr") "fajr" else "regular"
    // Bound title/body so a malformed/oversized extra can't render a broken
    // notification. (Security F3)
    val title = (intent?.getStringExtra(EXTRA_TITLE) ?: "Ezan").take(200)
    val body = (intent?.getStringExtra(EXTRA_BODY) ?: "").take(200)
    // Localized "Stop" label from JS; bounded + non-blank fallback so a missing
    // extra (e.g. a pre-stopLabel persisted alarm) still renders a usable button.
    val stopLabel = (intent?.getStringExtra(EXTRA_STOP_LABEL)?.takeIf { it.isNotBlank() } ?: "Durdur").take(40)

    startForegroundNotification(title, body, stopLabel)
    startPlayback(soundKind)
    return START_NOT_STICKY
  }

  private fun startForegroundNotification(title: String, body: String, stopLabel: String) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(CHANNEL_ID, "Ezan oynatılıyor", NotificationManager.IMPORTANCE_HIGH)
      ch.setSound(null, null) // audio comes from MediaPlayer, not the channel
      nm.createNotificationChannel(ch)
    }
    val stopIntent = Intent(this, AdhanPlaybackService::class.java).apply { action = ACTION_STOP }
    val stopPi = PendingIntent.getService(
      this, 1, stopIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val openPi = packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      // Tapping the body opens the app; the ongoing notification + audio are
      // dismissed when the user taps Durdur or playback completes.
      PendingIntent.getActivity(this, 2, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val icon = applicationInfo.icon
    val notif: Notification = Notification.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(icon)
      .setOngoing(true)
      .setContentIntent(openPi)
      .addAction(Notification.Action.Builder(null, stopLabel, stopPi).build())
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }

  private fun startPlayback(soundKind: String) {
    val resId = if (soundKind == "fajr")
      resources.getIdentifier("adhan_fajr_full", "raw", packageName)
    else
      resources.getIdentifier("adhan_regular_full", "raw", packageName)
    player?.release()
    player = null
    val afd = try {
      resources.openRawResourceFd(resId)
    } catch (_: android.content.res.Resources.NotFoundException) {
      null
    }
    if (afd == null) {
      stopPlaybackAndSelf()
      return
    }
    player = MediaPlayer().apply {
      // USAGE_ALARM so the adhan is heard even when the media stream is low or
      // ducked — it must reach the worshipper, not silently follow music
      // volume. MediaPlayer.create() can't set this, hence the manual setup. (Review L2)
      setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build(),
      )
      setOnCompletionListener { stopPlaybackAndSelf() }
      setOnErrorListener { _, _, _ -> stopPlaybackAndSelf(); true }
      try {
        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        afd.close()
        setOnPreparedListener { start() }
        prepareAsync()
      } catch (_: Exception) {
        try { afd.close() } catch (_: Exception) {}
        release()
        stopPlaybackAndSelf()
      }
    }
  }

  private fun stopPlaybackAndSelf() {
    try { player?.takeIf { it.isPlaying }?.stop() } catch (_: IllegalStateException) {}
    player?.release()
    player = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION") stopForeground(true)
    }
    stopSelf()
  }

  override fun onDestroy() {
    player?.release()
    player = null
    super.onDestroy()
  }

  companion object {
    const val CHANNEL_ID = "adhan-playing"
    const val NOTIF_ID = 4711
    const val ACTION_STOP = "expo.modules.adhanplayer.STOP"
    const val EXTRA_PRAYER_KEY = "prayerKey"
    const val EXTRA_SOUND_KIND = "soundKind"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_STOP_LABEL = "stopLabel"
  }
}
