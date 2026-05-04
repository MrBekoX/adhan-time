import * as Notifications from 'expo-notifications';

import { runLifecycleOnce } from '../useAppLifecycle';

import { registerDevice } from '@/services/deviceRegistry';
import { syncYearly } from '@/services/prayerService';
import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';

jest.mock('@/services/prayerService', () => ({
  syncYearly: jest.fn(),
}));

jest.mock('@/services/deviceRegistry', () => ({
  registerDevice: jest.fn(),
}));

const syncMock = syncYearly as jest.Mock;
const registerMock = registerDevice as jest.Mock;
const getPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;

const VALID_LOCATION = {
  countryId: '2',
  countryName: 'TÜRKİYE',
  stateId: '506',
  stateName: 'Istanbul',
  districtId: '9541',
  districtName: 'Istanbul',
  timezone: 'Europe/Istanbul',
};

describe('runLifecycleOnce — F4 sync-fail surfaces to uiStore', () => {
  beforeEach(() => {
    syncMock.mockReset();
    registerMock.mockReset().mockResolvedValue(undefined);
    getPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
    useUiStore.setState({ lastError: null });
    useLocationStore.setState({ selected: VALID_LOCATION });
    useSettingsStore.setState({
      locale: 'tr',
      sound: 'default',
      enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
      notificationPermissionDenied: false,
    });
  });

  it('writes a sync-failed error to useUiStore when syncYearly rejects', async () => {
    syncMock.mockRejectedValue(new Error('network'));

    await runLifecycleOnce();

    const err = useUiStore.getState().lastError;
    expect(err).not.toBeNull();
    expect(err?.code).toBe('sync-failed');
  });

  it('still attempts device registration even when sync fails (resilience)', async () => {
    syncMock.mockRejectedValue(new Error('network'));

    await runLifecycleOnce();

    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  it('does not write any error when sync succeeds', async () => {
    syncMock.mockResolvedValue({ entries: [] });

    await runLifecycleOnce();

    expect(useUiStore.getState().lastError).toBeNull();
  });

  it('clears a stale sync-failed error after a successful sync', async () => {
    useUiStore.setState({ lastError: { code: 'sync-failed' } });
    syncMock.mockResolvedValue({ entries: [] });

    await runLifecycleOnce();

    expect(useUiStore.getState().lastError).toBeNull();
  });

  it('returns early without touching uiStore when no location is selected', async () => {
    useLocationStore.setState({ selected: null });

    await runLifecycleOnce();

    expect(syncMock).not.toHaveBeenCalled();
    expect(registerMock).not.toHaveBeenCalled();
    expect(useUiStore.getState().lastError).toBeNull();
  });
});

describe('runLifecycleOnce — V5 permission reconciliation', () => {
  beforeEach(() => {
    syncMock.mockReset().mockResolvedValue({ entries: [] });
    registerMock.mockReset().mockResolvedValue(undefined);
    getPermissionsAsync.mockReset();
    useUiStore.setState({ lastError: null });
    useLocationStore.setState({ selected: VALID_LOCATION });
    useSettingsStore.setState({
      locale: 'tr',
      sound: 'default',
      enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
      notificationPermissionDenied: false,
    });
  });

  it('clears notificationPermissionDenied when the OS now reports granted', async () => {
    useSettingsStore.setState({ notificationPermissionDenied: true });
    getPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().notificationPermissionDenied).toBe(false);
  });

  it('sets notificationPermissionDenied=true when a previously-granted user revoked notifications', async () => {
    useSettingsStore.setState({ notificationPermissionDenied: false });
    getPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().notificationPermissionDenied).toBe(true);
  });

  it('leaves the flag alone when state already matches the OS', async () => {
    useSettingsStore.setState({ notificationPermissionDenied: false });
    getPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().notificationPermissionDenied).toBe(false);
  });

  it('does not crash if Notifications.getPermissionsAsync rejects', async () => {
    getPermissionsAsync.mockRejectedValue(new Error('boom'));

    await expect(runLifecycleOnce()).resolves.toBeUndefined();
    // sync still runs even when the permission probe failed.
    expect(syncMock).toHaveBeenCalledTimes(1);
  });
});
