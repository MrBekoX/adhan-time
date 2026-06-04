// Sound routing for the server-push fallback. Mirrors constants/notifications.ts
// (soundForPrayer/channelIdForPrayer) on the app side — the RN/Deno boundary can't
// share a module. One bundled custom notification sound for all prayers; iOS plays
// the file via `sound`, Android via the matching channel. Any non-'default' pref
// (incl. legacy 'adhanShort'/'adhanLong' from devices that haven't updated) maps to
// the notification sound; on an old build whose channel differs the OS simply falls
// back to its default sound (acceptable for this 5-day-inactive fallback path).
//
// Kept in its own pure module (no Deno globals) so it can be unit-tested without
// importing index.ts (which calls Deno.serve at load). Tests also assert it stays
// in sync with the device-side constants to catch cross-boundary drift.
export const SOUND_NOTIFICATION = 'notification.wav';
export const CHANNEL_DEFAULT = 'adhan';
export const CHANNEL_NOTIFICATION = 'adhan-notification';

export function pushSoundFor(pref: string): string {
  return pref === 'default' ? 'default' : SOUND_NOTIFICATION;
}

export function pushChannelFor(pref: string): string {
  return pref === 'default' ? CHANNEL_DEFAULT : CHANNEL_NOTIFICATION;
}
