import { migrateSettingsState } from '../settingsStore.migration';
import { useSettingsStore } from '../settingsStore';

describe('migrateSettingsState (V5 — settingsStore v1 → v2)', () => {
  it('adds notificationPermissionDenied=false to v1 blobs that lack the field', () => {
    const result = migrateSettingsState(
      {
        locale: 'tr',
        sound: 'default',
        enabledPrayers: ['imsak', 'gunes'],
        onboardingCompleted: true,
      },
      1,
    );
    expect(result.notificationPermissionDenied).toBe(false);
    // Other fields should pass through untouched.
    expect(result.locale).toBe('tr');
    expect(result.sound).toBe('default');
    expect(result.onboardingCompleted).toBe(true);
  });

  it('does NOT clobber a true value carried from a future build that already had the flag', () => {
    const result = migrateSettingsState(
      { locale: 'en', notificationPermissionDenied: true },
      1,
    );
    expect(result.notificationPermissionDenied).toBe(true);
  });

  it('passes v2+ blobs through unchanged', () => {
    const blob = { locale: 'ar', notificationPermissionDenied: true };
    expect(migrateSettingsState(blob, 2)).toEqual(blob);
  });

  it('handles empty/null persisted state without crashing', () => {
    expect(migrateSettingsState(undefined, 1)).toEqual({ notificationPermissionDenied: false });
    expect(migrateSettingsState(null, 1)).toEqual({ notificationPermissionDenied: false });
    expect(migrateSettingsState({}, 1)).toEqual({ notificationPermissionDenied: false });
  });
});

describe('useSettingsStore — V5 notificationPermissionDenied flag', () => {
  it('exposes notificationPermissionDenied with a default of false', () => {
    useSettingsStore.setState({ notificationPermissionDenied: false });
    expect(useSettingsStore.getState().notificationPermissionDenied).toBe(false);
  });

  it('setNotificationPermissionDenied flips the flag', () => {
    useSettingsStore.getState().setNotificationPermissionDenied(true);
    expect(useSettingsStore.getState().notificationPermissionDenied).toBe(true);
    useSettingsStore.getState().setNotificationPermissionDenied(false);
    expect(useSettingsStore.getState().notificationPermissionDenied).toBe(false);
  });

  it('reset() does NOT clear notificationPermissionDenied (denied users keep their banner across resets)', () => {
    useSettingsStore.getState().setNotificationPermissionDenied(true);
    useSettingsStore.getState().reset();
    // Reset is meant to wipe locale/sound/etc. but the OS-level permission
    // status doesn't change just because the user reset the app — the banner
    // must persist until the user actually grants the permission again.
    expect(useSettingsStore.getState().notificationPermissionDenied).toBe(true);
  });
});
