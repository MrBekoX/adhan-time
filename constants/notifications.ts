export const ANDROID_CHANNEL_ID = 'adhan';
export const ANDROID_CHANNEL_NAME = 'Ezan Vakitleri';
// V8: Android cannot change a channel's sound at runtime, so the custom-ringtone
// variant lives in its own channel. The scheduler picks the channel ID per
// notification based on the user's current sound preference.
export const ANDROID_CHANNEL_CUSTOM_ID = 'adhan-custom';
export const ANDROID_CHANNEL_CUSTOM_NAME = 'Ezan Vakitleri (Kısa Ezan)';

export const NOTIFICATION_ID_PREFIX = 'prayer';
export const ROLLING_WINDOW_DAYS = 10;
// V2: iOS allows ~64 pending UNCalendarNotificationTriggers system-wide; we
// keep our own queue at ≤ 50 so adhan notifications never silently fall off
// when other apps share the slot. With 6 prayers enabled the rolling window
// shrinks to 8 days (6 × 8 = 48) so the count stays under the cap without
// users wondering why "10 days × 6 prayers = 50".
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

export function buildNotificationId(districtId: string, dateIso: string, prayerKey: string): string {
  return `${NOTIFICATION_ID_PREFIX}-${districtId}-${dateIso}-${prayerKey}`;
}

export function isPrayerNotificationId(id: string): boolean {
  return id.startsWith(`${NOTIFICATION_ID_PREFIX}-`);
}
