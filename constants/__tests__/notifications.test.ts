import {
  ANDROID_CHANNEL_FAJR_ID,
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_REGULAR_ID,
  SOUND_FILES,
  adhanPlaybackBackend,
  channelIdForPrayer,
  soundForPrayer,
} from '@/constants/notifications';
import { PRAYER_KEYS } from '@/constants/prayers';

describe('per-prayer adhan sound selection', () => {
  it('maps imsak to the fajr adhan clip', () => {
    expect(soundForPrayer('imsak', 'adhanShort')).toBe(SOUND_FILES.fajr);
  });

  it('maps every non-imsak prayer to the regular adhan clip', () => {
    for (const key of PRAYER_KEYS) {
      if (key === 'imsak') continue;
      expect(soundForPrayer(key, 'adhanShort')).toBe(SOUND_FILES.regular);
    }
  });

  it('falls back to the system default for every prayer when the preference is default', () => {
    for (const key of PRAYER_KEYS) {
      expect(soundForPrayer(key, 'default')).toBe('default');
    }
  });

  it('uses the same per-prayer clips for adhanLong (the expo path is identical to adhanShort)', () => {
    expect(soundForPrayer('imsak', 'adhanLong')).toBe(SOUND_FILES.fajr);
    expect(soundForPrayer('ogle', 'adhanLong')).toBe(SOUND_FILES.regular);
  });
});

describe('per-prayer Android channel selection', () => {
  it('routes imsak to the fajr channel and the rest to the regular channel', () => {
    expect(channelIdForPrayer('imsak', 'adhanShort')).toBe(ANDROID_CHANNEL_FAJR_ID);
    expect(channelIdForPrayer('ogle', 'adhanShort')).toBe(ANDROID_CHANNEL_REGULAR_ID);
    expect(channelIdForPrayer('yatsi', 'adhanShort')).toBe(ANDROID_CHANNEL_REGULAR_ID);
  });

  it('routes every prayer to the default channel when the preference is default', () => {
    for (const key of PRAYER_KEYS) {
      expect(channelIdForPrayer(key, 'default')).toBe(ANDROID_CHANNEL_ID);
    }
  });

  it('routes adhanLong to the same per-prayer channels as adhanShort (gunes/expo path)', () => {
    expect(channelIdForPrayer('imsak', 'adhanLong')).toBe(ANDROID_CHANNEL_FAJR_ID);
    expect(channelIdForPrayer('gunes', 'adhanLong')).toBe(ANDROID_CHANNEL_REGULAR_ID);
  });
});

describe('adhan playback backend selection', () => {
  it('routes the 5 adhan prayers to the native full-adhan player on Android only for adhanLong', () => {
    for (const k of ['imsak', 'ogle', 'ikindi', 'aksam', 'yatsi']) {
      expect(adhanPlaybackBackend(k, 'android', 'adhanLong')).toBe('native');
    }
  });
  it('keeps gunes on expo even on Android with adhanLong (no sunrise adhan)', () => {
    expect(adhanPlaybackBackend('gunes', 'android', 'adhanLong')).toBe('expo');
  });
  it('keeps adhanShort (short clip) on expo for every prayer on Android — native is adhanLong-only', () => {
    for (const k of PRAYER_KEYS) {
      expect(adhanPlaybackBackend(k, 'android', 'adhanShort')).toBe('expo');
    }
  });
  it('uses expo for all prayers on iOS regardless of preference (no native full player on iOS)', () => {
    for (const k of ['imsak', 'ogle', 'gunes']) {
      expect(adhanPlaybackBackend(k, 'ios', 'adhanLong')).toBe('expo');
      expect(adhanPlaybackBackend(k, 'ios', 'adhanShort')).toBe('expo');
    }
  });
  it('uses expo on Android when the preference is default', () => {
    expect(adhanPlaybackBackend('imsak', 'android', 'default')).toBe('expo');
  });
});
