/**
 * Forward-only persisted-state migrations for the settings store.
 *
 * v1 → v2 (V5): `notificationPermissionDenied` introduced so Home can show
 * the openSettings banner across launches, not just during onboarding.
 * Existing persisted blobs lacked the field — backfill `false` so an
 * existing user is not falsely marked denied.
 *
 * v2 → v3 (V16+F6): `deviceRegistrationPending` introduced so a failed
 * registerDevice call survives a process kill and gets retried on the
 * next foreground tick. Existing blobs lacked the field — backfill
 * `false`; a new user has no pending registration to retry.
 *
 * Pure for testability — keep AsyncStorage out of this module.
 */
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
