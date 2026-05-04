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

  it('passes v3+ blobs through unchanged', () => {
    const blob = {
      locale: 'ar',
      notificationPermissionDenied: true,
      deviceRegistrationPending: false,
    };
    expect(migrateSettingsState(blob, 3)).toEqual(blob);
  });

  it('handles empty/null persisted state without crashing', () => {
    expect(migrateSettingsState(undefined, 1)).toEqual({
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
    });
    expect(migrateSettingsState(null, 1)).toEqual({
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
    });
    expect(migrateSettingsState({}, 1)).toEqual({
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
    });
  });
});

describe('migrateSettingsState (V16+F6 — settingsStore v2 → v3)', () => {
  it('adds deviceRegistrationPending=false to v2 blobs that lack the field', () => {
    const result = migrateSettingsState(
      {
        locale: 'tr',
        sound: 'default',
        enabledPrayers: ['imsak', 'gunes'],
        onboardingCompleted: true,
        notificationPermissionDenied: false,
      },
      2,
    );
    expect(result.deviceRegistrationPending).toBe(false);
    // V5 field stays.
    expect(result.notificationPermissionDenied).toBe(false);
  });

  it('does not clobber a true deviceRegistrationPending carried from a future build', () => {
    const result = migrateSettingsState(
      { locale: 'en', deviceRegistrationPending: true },
      2,
    );
    expect(result.deviceRegistrationPending).toBe(true);
  });

  it('runs both migrations in order when starting from v1', () => {
    const result = migrateSettingsState({ locale: 'tr' }, 1);
    expect(result.notificationPermissionDenied).toBe(false);
    expect(result.deviceRegistrationPending).toBe(false);
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

describe('useSettingsStore — V16+F6 deviceRegistrationPending flag', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      deviceRegistrationPending: false,
      notificationPermissionDenied: false,
    });
  });

  it('exposes deviceRegistrationPending with a default of false', () => {
    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(false);
  });

  it('setDeviceRegistrationPending flips the flag', () => {
    useSettingsStore.getState().setDeviceRegistrationPending(true);
    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(true);
    useSettingsStore.getState().setDeviceRegistrationPending(false);
    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(false);
  });

  it('reset() clears deviceRegistrationPending (a fresh wipe means no server registration to retry)', () => {
    useSettingsStore.getState().setDeviceRegistrationPending(true);
    useSettingsStore.getState().reset();
    // Unlike notificationPermissionDenied (which mirrors OS state), this flag
    // is a server-side reminder — after a "Delete my data" wipe, there is no
    // device row left to register, so the pending flag must clear.
    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(false);
  });
});
