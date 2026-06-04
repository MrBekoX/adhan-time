import { channelIdForPrayer, soundForPrayer } from '@/constants/notifications';

import {
  CHANNEL_DEFAULT,
  CHANNEL_NOTIFICATION,
  SOUND_NOTIFICATION,
  pushChannelFor,
  pushSoundFor,
} from './sound-routing';

describe('push-prayer sound routing', () => {
  it('maps the default preference to the system sound + default channel', () => {
    expect(pushSoundFor('default')).toBe('default');
    expect(pushChannelFor('default')).toBe(CHANNEL_DEFAULT);
  });

  it('maps the notification preference to the bundled custom sound + custom channel', () => {
    expect(pushSoundFor('notification')).toBe(SOUND_NOTIFICATION);
    expect(pushChannelFor('notification')).toBe(CHANNEL_NOTIFICATION);
  });

  it('maps legacy adhanShort/adhanLong to the notification sound + channel (back-compat for un-updated devices)', () => {
    for (const legacy of ['adhanShort', 'adhanLong']) {
      expect(pushSoundFor(legacy)).toBe(SOUND_NOTIFICATION);
      expect(pushChannelFor(legacy)).toBe(CHANNEL_NOTIFICATION);
    }
  });

  // Cross-boundary guard: the edge function and the device must produce identical
  // sound/channel literals. They can't share a module (RN vs Deno), so pin them.
  it('stays in sync with the device-side mapping (constants/notifications.ts)', () => {
    expect(pushSoundFor('default')).toBe(soundForPrayer('default'));
    expect(pushSoundFor('notification')).toBe(soundForPrayer('notification'));
    expect(pushChannelFor('default')).toBe(channelIdForPrayer('default'));
    expect(pushChannelFor('notification')).toBe(channelIdForPrayer('notification'));
  });
});
