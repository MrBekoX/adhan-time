import { migrateSettingsState } from '../settingsStore.migration';
import { useSettingsStore } from '../settingsStore';

import { REMINDER_MAX_MINUTES } from '@/constants/notifications';

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

  it('passes v3+ blobs through but backfills the v6 reminderMinutes field', () => {
    const blob = {
      locale: 'ar',
      notificationPermissionDenied: true,
      deviceRegistrationPending: false,
    };
    // The v3→v5 field-adds and sound remap don't fire for this blob, but the
    // v6 step backfills reminderMinutes for any pre-v6 persisted state.
    expect(migrateSettingsState(blob, 3)).toEqual({ ...blob, reminderMinutes: 0 });
  });

  it('handles empty/null persisted state without crashing', () => {
    expect(migrateSettingsState(undefined, 1)).toEqual({
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
      reminderMinutes: 0,
    });
    expect(migrateSettingsState(null, 1)).toEqual({
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
      reminderMinutes: 0,
    });
    expect(migrateSettingsState({}, 1)).toEqual({
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
      reminderMinutes: 0,
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

describe('migrateSettingsState (notification sound — settingsStore → v5)', () => {
  it("collapses a legacy 'adhanShort' to 'notification' (adhan recitation removed)", () => {
    // v3→v4 maps adhanShort→adhanLong, then v4→v5 maps adhanLong→notification.
    const result = migrateSettingsState({ locale: 'tr', sound: 'adhanShort' }, 3);
    expect(result.sound).toBe('notification');
  });

  it("collapses a legacy 'adhanLong' to 'notification'", () => {
    const result = migrateSettingsState({ locale: 'tr', sound: 'adhanLong' }, 4);
    expect(result.sound).toBe('notification');
  });

  it("collapses a v4-persisted 'adhanShort' (the 'Kısa Ezan' cohort) to 'notification'", () => {
    // The shipped v4 build let users pick 'adhanShort'; the v3->v4 remap is guarded
    // by version<4 so it does NOT fire for a v4 blob — the v4->v5 step must catch it.
    const result = migrateSettingsState({ locale: 'tr', sound: 'adhanShort' }, 4);
    expect(result.sound).toBe('notification');
  });

  it("leaves 'default' untouched", () => {
    const result = migrateSettingsState({ locale: 'tr', sound: 'default' }, 4);
    expect(result.sound).toBe('default');
  });

  it("leaves 'notification' untouched (idempotent)", () => {
    const result = migrateSettingsState({ locale: 'tr', sound: 'notification' }, 4);
    expect(result.sound).toBe('notification');
  });

  it('carries any legacy adhan option through a full v1→v5 migration', () => {
    const result = migrateSettingsState({ locale: 'tr', sound: 'adhanShort' }, 1);
    expect(result.sound).toBe('notification');
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

describe('useSettingsStore — reminderMinutes', () => {
  beforeEach(() => useSettingsStore.setState({ reminderMinutes: 0 }));

  it('defaults to 0 (off)', () => {
    expect(useSettingsStore.getState().reminderMinutes).toBe(0);
  });

  it('clamps a value above the max down to 30', () => {
    useSettingsStore.getState().setReminderMinutes(35);
    expect(useSettingsStore.getState().reminderMinutes).toBe(REMINDER_MAX_MINUTES);
  });

  it('clamps a negative value up to 0', () => {
    useSettingsStore.getState().setReminderMinutes(-5);
    expect(useSettingsStore.getState().reminderMinutes).toBe(0);
  });

  it('rounds a fractional value to the nearest minute', () => {
    useSettingsStore.getState().setReminderMinutes(7.6);
    expect(useSettingsStore.getState().reminderMinutes).toBe(8);
  });
});

describe('migrateSettingsState (v6 — reminderMinutes backfill)', () => {
  it('adds reminderMinutes=0 to a v5 blob that lacks the field', () => {
    const result = migrateSettingsState({ locale: 'tr', sound: 'notification' }, 5);
    expect(result.reminderMinutes).toBe(0);
  });

  it('does not clobber a reminderMinutes carried from a future build', () => {
    const result = migrateSettingsState({ locale: 'tr', reminderMinutes: 15 }, 5);
    expect(result.reminderMinutes).toBe(15);
  });
});
