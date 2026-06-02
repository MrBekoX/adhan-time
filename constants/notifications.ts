export const ANDROID_CHANNEL_ID = 'adhan';
export const ANDROID_CHANNEL_NAME = 'Ezan Vakitleri';
// Android freezes a channel's sound at first registration, so each distinct
// adhan recording needs its own channel. The fajr (sabah) adhan differs
// melodically from the one called at the remaining prayers, so they get
// separate channels; the scheduler routes each notification to the channel
// matching its prayer.
export const ANDROID_CHANNEL_FAJR_ID = 'adhan-fajr';
export const ANDROID_CHANNEL_FAJR_NAME = 'Sabah Ezanı';
export const ANDROID_CHANNEL_REGULAR_ID = 'adhan-regular';
export const ANDROID_CHANNEL_REGULAR_NAME = 'Ezan Vakitleri (Ezan Sesi)';

export const NOTIFICATION_ID_PREFIX = 'prayer';
export const ROLLING_WINDOW_DAYS = 10;
// iOS allows ~64 pending UNCalendarNotificationTriggers system-wide; we
// cap at 50 so adhan notifications never silently fall off when other apps
// share the slot. With all 6 prayers enabled the rolling window auto-shrinks
// to 8 days (6 × 8 = 48) to stay under this cap.
export const PENDING_NOTIFICATION_HARD_CAP = 50;
export const ROLLING_WINDOW_DAYS_ALL_PRAYERS = 8;
export const ALL_PRAYERS_COUNT = 6;

// Two short (<=30s) clips ship in assets/sounds/. iOS plays them by filename;
// Android plays them via the matching channel above. Bundled and declared in
// app.json's expo-notifications plugin.
export const SOUND_FILES = {
  fajr: 'adhan_fajr.wav',
  regular: 'adhan_regular.wav',
} as const;

export const DEFAULT_SOUND = 'default';

// User-facing preference. Kept as a standalone union (not derived from the file
// map) because the persisted settings store and the register-device validators
// share these exact literals.
//   - 'default'    → system notification sound.
//   - 'adhanShort' → the ≤30s adhan clip as the notification sound (expo path on
//                    BOTH platforms — no native player).
//   - 'adhanLong'  → the FULL adhan: Android routes the 5 adhan prayers to the
//                    native player (adhan_*_full.m4a, stoppable); iOS can't play
//                    full audio in the background so it falls back to the ≤30s
//                    clip (same as 'adhanShort') — no false parity (rules/11).
// Both adhan prefs use the same ≤30s clip on the expo path; the ONLY difference
// is that 'adhanLong' additionally arms the native full-adhan player on Android.
export type SoundKey = 'default' | 'adhanShort' | 'adhanLong';

// imsak is the dawn (sabah/fajr) prayer; every other slot — including gunes —
// uses the regular adhan.
function isFajrPrayer(prayerKey: string): boolean {
  return prayerKey === 'imsak';
}

export function soundForPrayer(prayerKey: string, pref: SoundKey): string {
  if (pref === 'default') return DEFAULT_SOUND;
  return isFajrPrayer(prayerKey) ? SOUND_FILES.fajr : SOUND_FILES.regular;
}

export function channelIdForPrayer(prayerKey: string, pref: SoundKey): string {
  if (pref === 'default') return ANDROID_CHANNEL_ID;
  return isFajrPrayer(prayerKey) ? ANDROID_CHANNEL_FAJR_ID : ANDROID_CHANNEL_REGULAR_ID;
}

// The five prayers at which an adhan is actually called. gunes (sunrise) has
// no adhan, so it never routes to the full-adhan native player.
const NATIVE_ADHAN_PRAYERS = new Set<string>(['imsak', 'ogle', 'ikindi', 'aksam', 'yatsi']);

// Only 'adhanLong' (full adhan) on Android routes the 5 adhan prayers to the
// native player. 'adhanShort' (≤30s clip), gunes (no sunrise adhan), iOS, and
// the default-sound preference all stay on expo-notifications.
export function adhanPlaybackBackend(
  prayerKey: string,
  platform: 'ios' | 'android',
  pref: SoundKey,
): 'native' | 'expo' {
  if (platform !== 'android') return 'expo';
  if (pref !== 'adhanLong') return 'expo';
  return NATIVE_ADHAN_PRAYERS.has(prayerKey) ? 'native' : 'expo';
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
): string {
  const firePart = fireAtIso ? `-${idPart(fireAtIso.slice(11, 16))}` : '';
  return `${NOTIFICATION_ID_PREFIX}-${idPart(districtId)}-${dateIso}-${idPart(prayerKey)}-${idPart(timezone)}${firePart}`;
}

export function isPrayerNotificationId(id: string): boolean {
  return id.startsWith(`${NOTIFICATION_ID_PREFIX}-`);
}
