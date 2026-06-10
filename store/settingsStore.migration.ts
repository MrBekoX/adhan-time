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
  reminderMinutes?: number;
  batteryExemptionAsked?: boolean;
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
    // (Historical v3→v4) The adhan options split; 'adhanShort' mapped to 'adhanLong'.
    // Both are collapsed to 'notification' by the v4→v5 step below.
    safe = { ...safe, sound: 'adhanLong' };
  }
  if (version < 5 && (safe.sound === 'adhanShort' || safe.sound === 'adhanLong')) {
    // Adhan recitation was removed (third-party-recording copyright) in favor of a
    // single bundled notification sound. Anyone who had any adhan option now gets
    // that notification sound; 'default' (system sound) is unchanged.
    safe = { ...safe, sound: 'notification' };
  }
  if (version < 6) {
    // Pre-prayer reminder added; existing users default to off (0).
    safe = { ...safe, reminderMinutes: safe.reminderMinutes ?? 0 };
  }
  if (version < 7) {
    // Battery-optimization exemption prompt added (Android). Existing users
    // haven't been asked yet, so onboarding/Settings can offer it once.
    safe = { ...safe, batteryExemptionAsked: safe.batteryExemptionAsked ?? false };
  }

  return safe;
}
