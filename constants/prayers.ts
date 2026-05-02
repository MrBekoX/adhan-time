export const PRAYER_KEYS = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'] as const;

export type PrayerKey = (typeof PRAYER_KEYS)[number];

export const DEFAULT_ENABLED_PRAYERS: PrayerKey[] = ['imsak', 'ogle', 'ikindi', 'aksam', 'yatsi'];
