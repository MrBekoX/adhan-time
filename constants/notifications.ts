export const ANDROID_CHANNEL_ID = 'adhan';
export const ANDROID_CHANNEL_NAME = 'Ezan Vakitleri';
// Android freezes a channel's sound at first registration, so the bundled custom
// notification sound needs its own channel, separate from the system-default one.
// The scheduler routes each notification to the channel matching the user's sound
// preference. The default channel keeps its original id ('adhan') so users who
// already had it keep their per-channel system settings.
export const ANDROID_CHANNEL_NOTIFICATION_ID = 'adhan-notification';
export const ANDROID_CHANNEL_NOTIFICATION_NAME = 'Ezan Vakitleri (Bildirim Sesi)';

export const NOTIFICATION_ID_PREFIX = 'prayer';
export const ROLLING_WINDOW_DAYS = 10;
// Pre-prayer reminder: a "Yaklaşıyor / Coming up" notification fired this many
// minutes before each adhan. User-set 0–30 (0 = off). Reminders are scheduled
// only for the nearest REMINDER_WINDOW_DAYS days so the doubled queue stays
// under the iOS pending cap (adhans are always scheduled first — see
// notificationScheduler.computeTargetsWithStats).
export const REMINDER_MAX_MINUTES = 30;
export const REMINDER_WINDOW_DAYS = 2;
// iOS allows ~64 pending UNCalendarNotificationTriggers system-wide; we cap at
// 50 so prayer notifications never silently fall off when other apps share the
// slot. With all 6 prayers enabled the rolling window auto-shrinks to 8 days
// (6 × 8 = 48) to stay under this cap.
export const PENDING_NOTIFICATION_HARD_CAP = 50;
export const ROLLING_WINDOW_DAYS_ALL_PRAYERS = 8;
export const ALL_PRAYERS_COUNT = 6;

// Vibration pattern [wait, buzz, pause, buzz] shared by the Android notification
// channels (background) AND the in-app foreground cue, so a prayer/reminder feels
// the same whether the app is open or not. Foreground uses react-native's
// Vibration (a strong, settings-independent alert buzz) because the OS channel
// vibration is suppressed for foreground notifications and Haptics.notificationAsync
// alone is too subtle / depends on the system haptic-feedback setting.
export const VIBRATION_PATTERN = [0, 500, 250, 500];

// The bundled custom notification sound (<=30s, PCM WAV). iOS plays it by
// filename; Android plays it via the notification channel below. Declared in
// app.json's expo-notifications plugin. Self-generated and owned (no third-party
// adhan-recording copyright) — see
// docs/superpowers/specs/2026-06-04-notification-sound-replace-adhan-design.md
export const NOTIFICATION_SOUND_FILE = 'notification.wav';

export const DEFAULT_SOUND = 'default';

// User-facing preference. Kept as a standalone union because the persisted
// settings store and the register-device validator share these exact literals.
//   - 'default'      → system notification sound.
//   - 'notification' → the bundled custom notification sound (NOTIFICATION_SOUND_FILE),
//                      identical on iOS + Android via expo-notifications.
export type SoundKey = 'default' | 'notification';

export function soundForPrayer(pref: SoundKey): string {
  return pref === 'default' ? DEFAULT_SOUND : NOTIFICATION_SOUND_FILE;
}

export function channelIdForPrayer(pref: SoundKey): string {
  return pref === 'default' ? ANDROID_CHANNEL_ID : ANDROID_CHANNEL_NOTIFICATION_ID;
}

function idPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_');
}

export function buildNotificationId(
  districtId: string,
  dateIso: string,
  prayerKey: string,
  timezone = 'tz-na',
  fireAtIso = '',
  kind: 'adhan' | 'reminder' = 'adhan',
): string {
  const firePart = fireAtIso ? `-${idPart(fireAtIso.slice(11, 16))}` : '';
  // The '-reminder' infix keeps reminder ids distinct from their adhan while
  // still matching isPrayerNotificationId (startsWith 'prayer-'), so reconcile
  // and cancelAll sweep both kinds.
  const kindPart = kind === 'reminder' ? '-reminder' : '';
  return `${NOTIFICATION_ID_PREFIX}${kindPart}-${idPart(districtId)}-${dateIso}-${idPart(prayerKey)}-${idPart(timezone)}${firePart}`;
}

export function isPrayerNotificationId(id: string): boolean {
  return id.startsWith(`${NOTIFICATION_ID_PREFIX}-`);
}
