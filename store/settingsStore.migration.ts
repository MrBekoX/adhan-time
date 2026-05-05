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

  return safe;
}
