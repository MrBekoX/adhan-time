/**
 * V5: settingsStore persists `notificationPermissionDenied` so a denied user
 * sees the banner-with-openSettings affordance on every Home visit, not just
 * during onboarding. Old persisted blobs (v1) lacked the field — migrate
 * fills it in with `false` so an existing user is not falsely marked denied.
 *
 * Pure for testability — keep AsyncStorage out of this module.
 */
export type PersistedSettingsShape = {
  locale?: string;
  sound?: string;
  enabledPrayers?: string[];
  onboardingCompleted?: boolean;
  notificationPermissionDenied?: boolean;
};

export function migrateSettingsState(
  persisted: unknown,
  version: number,
): PersistedSettingsShape {
  const safe = (persisted && typeof persisted === 'object' ? persisted : {}) as PersistedSettingsShape;

  if (version < 2) {
    return { ...safe, notificationPermissionDenied: safe.notificationPermissionDenied ?? false };
  }

  return safe;
}
