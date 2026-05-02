export const ANDROID_CHANNEL_ID = 'adhan';
export const ANDROID_CHANNEL_NAME = 'Ezan Vakitleri';

export const NOTIFICATION_ID_PREFIX = 'prayer';
export const ROLLING_WINDOW_DAYS = 10;

export const SOUNDS = {
  default: 'default',
  adhanShort: 'adhan_short.wav',
} as const;

export type SoundKey = keyof typeof SOUNDS;

export function buildNotificationId(districtId: string, dateIso: string, prayerKey: string): string {
  return `${NOTIFICATION_ID_PREFIX}-${districtId}-${dateIso}-${prayerKey}`;
}

export function isPrayerNotificationId(id: string): boolean {
  return id.startsWith(`${NOTIFICATION_ID_PREFIX}-`);
}
