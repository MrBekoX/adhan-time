export const ANDROID_CHANNEL_ID = 'adhan';
export const ANDROID_CHANNEL_NAME = 'Ezan Vakitleri';
// V8: Android cannot change a channel's sound at runtime, so the custom-ringtone
// variant lives in its own channel. The scheduler picks the channel ID per
// notification based on the user's current sound preference.
export const ANDROID_CHANNEL_CUSTOM_ID = 'adhan-custom';
export const ANDROID_CHANNEL_CUSTOM_NAME = 'Ezan Vakitleri (Kısa Ezan)';

export const NOTIFICATION_ID_PREFIX = 'prayer';
export const ROLLING_WINDOW_DAYS = 10;

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
