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
    .put("requestCode", requestCode)

  companion object {
    fun fromJson(o: JSONObject) = ArmedPrayer(
      id = o.getString("id"),
      prayerKey = o.getString("prayerKey"),
      fireAtEpochMs = o.getLong("fireAtEpochMs"),
      soundKind = o.getString("soundKind"),
      title = o.getString("title"),
      body = o.getString("body"),
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
    val arr = JSONArray(raw)
    return (0 until arr.length()).map { ArmedPrayer.fromJson(arr.getJSONObject(it)) }
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }
}
