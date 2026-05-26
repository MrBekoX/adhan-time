export const ANDROID_CHANNEL_ID = 'adhan';
export const ANDROID_CHANNEL_NAME = 'Ezan Vakitleri';
// Android freezes a channel's sound at first registration, so the custom
// ringtone needs its own channel. The scheduler picks per-notification
// based on the user's current sound preference.
export const ANDROID_CHANNEL_CUSTOM_ID = 'adhan-custom';
export const ANDROID_CHANNEL_CUSTOM_NAME = 'Ezan Vakitleri (Kısa Ezan)';

export const NOTIFICATION_ID_PREFIX = 'prayer';
export const ROLLING_WINDOW_DAYS = 10;
// iOS allows ~64 pending UNCalendarNotificationTriggers system-wide; we
// cap at 50 so adhan notifications never silently fall off when other apps
// share the slot. With all 6 prayers enabled the rolling window auto-shrinks
// to 8 days (6 × 8 = 48) to stay under this cap.
export const PENDING_NOTIFICATION_HARD_CAP = 50;
export const ROLLING_WINDOW_DAYS_ALL_PRAYERS = 8;
export const ALL_PRAYERS_COUNT = 6;

export const SOUNDS = {
  default: 'default',
  adhanShort: 'adhan_short.wav',
} as const;

export type SoundKey = keyof typeof SOUNDS;

export function channelIdForSound(soundKey: SoundKey): string {
  return soundKey === 'default' ? ANDROID_CHANNEL_ID : ANDROID_CHANNEL_CUSTOM_ID;
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
