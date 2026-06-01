package expo.modules.adhanplayer

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class ArmedPrayer(
  val id: String,
  val prayerKey: String,
  val fireAtEpochMs: Long,
  val soundKind: String, // "fajr" | "regular"
  val title: String,
  val body: String,
  // Localized "Stop" action label passed from JS. Persisted so boot re-arm
  // (which never goes through JS) keeps the right language. Empty = fall back to
  // the service's hardcoded default.
  val stopLabel: String = "",
  // Stable PendingIntent request code assigned by arm() (array index), persisted
  // so cancel() reconstructs the exact same PendingIntent. Defaults to 0 when an
  // ArmedPrayer is built from the JS payload before arm() assigns it.
  val requestCode: Int = 0,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("prayerKey", prayerKey)
    .put("fireAtEpochMs", fireAtEpochMs)
    .put("soundKind", soundKind)
    .put("title", title)
    .put("body", body)
    .put("stopLabel", stopLabel)
    .put("requestCode", requestCode)

  companion object {
    fun fromJson(o: JSONObject) = ArmedPrayer(
      id = o.getString("id"),
      prayerKey = o.getString("prayerKey"),
      fireAtEpochMs = o.getLong("fireAtEpochMs"),
      soundKind = o.getString("soundKind"),
      title = o.getString("title"),
      body = o.getString("body"),
      stopLabel = o.optString("stopLabel", ""),
      requestCode = o.optInt("requestCode", 0),
    )
  }
}

object AdhanScheduleStore {
  private const val PREFS = "adhan_player_schedule"
  private const val KEY = "armed"

  fun save(context: Context, prayers: List<ArmedPrayer>) {
    val arr = JSONArray()
    prayers.forEach { arr.put(it.toJson()) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putString(KEY, arr.toString()).apply()
  }

  fun load(context: Context): List<ArmedPrayer> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { ArmedPrayer.fromJson(arr.getJSONObject(it)) }
    } catch (_: Exception) {
      // Corrupt/partial JSON (e.g. process killed mid-write, or a schema from a
      // much older build) must not crash boot re-arm or cancelAll. Drop the bad
      // blob and return empty; the next reconcile rewrites it from the JS schedule.
      clear(context)
      emptyList()
    }
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }
}
