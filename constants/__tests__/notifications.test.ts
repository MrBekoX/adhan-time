import {
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_NOTIFICATION_ID,
  DEFAULT_SOUND,
  NOTIFICATION_SOUND_FILE,
  buildNotificationId,
  channelIdForPrayer,
  isPrayerNotificationId,
  soundForPrayer,
} from '@/constants/notifications';

describe('soundForPrayer', () => {
  it('uses the system default sound for the default preference', () => {
    expect(soundForPrayer('default')).toBe(DEFAULT_SOUND);
  });

  it('uses the bundled custom notification sound for the notification preference', () => {
    expect(soundForPrayer('notification')).toBe(NOTIFICATION_SOUND_FILE);
  });
});

describe('channelIdForPrayer', () => {
  it('routes the default preference to the default channel', () => {
    expect(channelIdForPrayer('default')).toBe(ANDROID_CHANNEL_ID);
  });

  it('routes the notification preference to the custom-sound channel', () => {
    expect(channelIdForPrayer('notification')).toBe(ANDROID_CHANNEL_NOTIFICATION_ID);
  });
});

describe('notification id helpers', () => {
  it('round-trips through isPrayerNotificationId', () => {
    const id = buildNotificationId('9541', '2026-05-02', 'imsak', 'Europe/Istanbul', '2026-05-02T05:54:00.000Z');
    expect(isPrayerNotificationId(id)).toBe(true);
    expect(id).toContain('9541');
    expect(id).toContain('imsak');
  });

  it('rejects non-prayer identifiers', () => {
    expect(isPrayerNotificationId('something-else')).toBe(false);
  });
});
