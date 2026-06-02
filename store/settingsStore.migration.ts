// Forward-only: each version block backfills a new field on older blobs.
// Pure (no AsyncStorage) for testability — invoked by zustand persist
// middleware against the raw persisted JSON.
export type PersistedSettingsShape = {
  locale?: string;
  sound?: string;
  enabledPrayers?: string[];
  onboardingCompleted?: boolean;
  notificationPermissionDenied?: boolean;
  deviceRegistrationPending?: boolean;
};

export function migrateSettingsState(
  persisted: unknown,
  version: number,
): PersistedSettingsShape {
  let safe = (persisted && typeof persisted === 'object' ? persisted : {}) as PersistedSettingsShape;

  if (version < 2) {
    safe = { ...safe, notificationPermissionDenied: safe.notificationPermissionDenied ?? false };
  }
  if (version < 3) {
    safe = { ...safe, deviceRegistrationPending: safe.deviceRegistrationPending ?? false };
  }
  if (version < 4 && safe.sound === 'adhanShort') {
    // The sound options split into 'adhanShort' (≤30s clip) and 'adhanLong'
    // (full adhan). Before the split, 'adhanShort' already played the FULL adhan
    // on Android via the native player, so existing users who picked it keep that
    // experience by mapping to 'adhanLong'. (iOS played the clip either way, so
    // no change there.) 'default'/'adhanLong' pass through untouched.
    safe = { ...safe, sound: 'adhanLong' };
  }

  return safe;
}
