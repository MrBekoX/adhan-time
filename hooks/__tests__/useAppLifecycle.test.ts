import * as Notifications from 'expo-notifications';
import * as React from 'react';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import TestRenderer from 'react-test-renderer';

import { runLifecycleOnce, useAppLifecycle } from '../useAppLifecycle';

import { registerDeviceDetailed } from '@/services/deviceRegistry';
import { syncYearly } from '@/services/prayerService';
import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';

jest.mock('@/services/prayerService', () => ({
  syncYearly: jest.fn(),
}));

jest.mock('@/services/deviceRegistry', () => ({
  registerDeviceDetailed: jest.fn(async () => ({ ok: true })),
}));

const syncMock = syncYearly as jest.Mock;
const registerMock = registerDeviceDetailed as jest.Mock;
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
    registerMock.mockReset().mockResolvedValue({ ok: true });
    getPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
    useUiStore.setState({ lastError: null });
    useLocationStore.setState({ selected: VALID_LOCATION });
    useSettingsStore.setState({
      locale: 'tr',
      sound: 'default',
      enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
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

  it("preserves a 'partial-sync' banner that syncYearly emitted internally", async () => {
    // Regression guard: the runLifecycleOnce cleanup clears 'sync-failed'
    // on a clean syncYearly resolution. fetchNextYearStart deliberately
    // uses a distinct 'partial-sync' code so its banner survives that
    // cleanup pass — without the distinction, year-boundary partial loss
    // would set a banner the same call immediately wipes.
    syncMock.mockImplementation(async () => {
      // Simulate fetchNextYearStart emitting the banner inside a successful
      // syncYearly resolution.
      useUiStore.getState().setError({
        code: 'partial-sync',
        message: 'next-year-range:upstream-502',
      });
      return { entries: [] };
    });

    await runLifecycleOnce();

    const err = useUiStore.getState().lastError;
    expect(err).not.toBeNull();
    expect(err?.code).toBe('partial-sync');
  });
});

describe('runLifecycleOnce — V5 permission reconciliation', () => {
  beforeEach(() => {
    syncMock.mockReset().mockResolvedValue({ entries: [] });
    registerMock.mockReset().mockResolvedValue({ ok: true });
    getPermissionsAsync.mockReset();
    useUiStore.setState({ lastError: null });
    useLocationStore.setState({ selected: VALID_LOCATION });
    useSettingsStore.setState({
      locale: 'tr',
      sound: 'default',
      enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
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

describe('runLifecycleOnce — V16+F6 device registration retry surface', () => {
  beforeEach(() => {
    syncMock.mockReset().mockResolvedValue({ entries: [] });
    registerMock.mockReset();
    getPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
    useUiStore.setState({ lastError: null });
    useLocationStore.setState({ selected: VALID_LOCATION });
    useSettingsStore.setState({
      locale: 'tr',
      sound: 'default',
      enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
    });
  });

  it("sets pending=true and 'device-registration-failed' banner on transient failure", async () => {
    registerMock.mockResolvedValueOnce({ ok: false, reason: 'transient' });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(true);
    expect(useUiStore.getState().lastError?.code).toBe('device-registration-failed');
  });

  it("emits 'device-registration-incompatible' (not the retry banner) on 4xx and does NOT set pending", async () => {
    // 4xx with the retry-button path becomes an infinite no-op loop —
    // the user must update the app, not click retry. Pending stays false
    // so AppState 'active' won't queue a doomed retry on the next tick.
    registerMock.mockResolvedValueOnce({ ok: false, reason: 'incompatible', status: 401 });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(false);
    const err = useUiStore.getState().lastError;
    expect(err?.code).toBe('device-registration-incompatible');
    expect(err?.data?.status).toBe(401);
  });

  it('clears a pending flag when 4xx surfaces (transient → incompatible transition)', async () => {
    useSettingsStore.setState({ deviceRegistrationPending: true });
    registerMock.mockResolvedValueOnce({ ok: false, reason: 'incompatible', status: 422 });

    await runLifecycleOnce();

    // A retry queued by an earlier transient failure must drop once a 4xx
    // arrives — retry can't recover from a 4xx, and Settings should stop
    // offering the retry button.
    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(false);
  });

  it('clears the pending flag and stale banner when registerDevice succeeds', async () => {
    useSettingsStore.setState({ deviceRegistrationPending: true });
    useUiStore.setState({ lastError: { code: 'device-registration-failed' } });
    registerMock.mockResolvedValueOnce({ ok: true });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(false);
    expect(useUiStore.getState().lastError).toBeNull();
  });

  it("clears a stale 'device-registration-incompatible' banner after a successful retry", async () => {
    useUiStore.setState({ lastError: { code: 'device-registration-incompatible' } });
    registerMock.mockResolvedValueOnce({ ok: true });

    await runLifecycleOnce();

    expect(useUiStore.getState().lastError).toBeNull();
  });

  it('does NOT touch sync-failed banners when only device registration is the issue', async () => {
    useUiStore.setState({ lastError: { code: 'sync-failed' } });
    registerMock.mockResolvedValueOnce({ ok: true });

    await runLifecycleOnce();

    // Sync succeeded, so the sync-failed clearing path runs and clears it.
    expect(useUiStore.getState().lastError).toBeNull();
  });

  it('keeps an existing pending flag set when registration still fails transiently', async () => {
    useSettingsStore.setState({ deviceRegistrationPending: true });
    registerMock.mockResolvedValueOnce({ ok: false, reason: 'transient' });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(true);
    expect(useUiStore.getState().lastError?.code).toBe('device-registration-failed');
  });

  it("does not overwrite a fresh 'sync-failed' banner with device registration errors", async () => {
    syncMock.mockRejectedValueOnce(new Error('sync-boom'));
    registerMock.mockResolvedValueOnce({ ok: false, reason: 'transient' });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(true);
    expect(useUiStore.getState().lastError?.code).toBe('sync-failed');
  });

  it("'no-token' result is a no-op for both flag and banner", async () => {
    registerMock.mockResolvedValueOnce({ ok: false, reason: 'no-token' });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(false);
    expect(useUiStore.getState().lastError).toBeNull();
  });

  it("'token-fetch-failed' sets pending=true and 'push-token-unavailable' banner (Issue #13)", async () => {
    // Permission granted but Expo SDK couldn't issue a token. Distinct from
    // device-registration-failed (server-side) so the banner copy can point
    // at the push-side issue.
    registerMock.mockResolvedValueOnce({ ok: false, reason: 'token-fetch-failed' });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(true);
    expect(useUiStore.getState().lastError?.code).toBe('push-token-unavailable');
  });

  it("clears a stale 'push-token-unavailable' banner once registerDevice succeeds", async () => {
    useUiStore.setState({ lastError: { code: 'push-token-unavailable' } });
    useSettingsStore.setState({ deviceRegistrationPending: true });
    registerMock.mockResolvedValueOnce({ ok: true });

    await runLifecycleOnce();

    expect(useSettingsStore.getState().deviceRegistrationPending).toBe(false);
    expect(useUiStore.getState().lastError).toBeNull();
  });
});

describe('useAppLifecycle — V16 AppState listener wiring', () => {
  // Mocks AppState.addEventListener to capture the subscriber and asserts
  // the lifecycle re-runs only on 'active' (not 'background'/'inactive')
  // and that sub.remove() fires on unmount.
  let listener: ((status: AppStateStatus) => void) | undefined;
  let mockSub: NativeEventSubscription;
  let addEventSpy: jest.SpyInstance;

  beforeEach(() => {
    syncMock.mockReset().mockResolvedValue({ entries: [] });
    registerMock.mockReset().mockResolvedValue({ ok: true });
    getPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
    useUiStore.setState({ lastError: null });
    useLocationStore.setState({ selected: VALID_LOCATION });
    useSettingsStore.setState({
      locale: 'tr',
      sound: 'default',
      enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
      notificationPermissionDenied: false,
      deviceRegistrationPending: false,
    });
    listener = undefined;
    mockSub = { remove: jest.fn() } as unknown as NativeEventSubscription;
    addEventSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(
      ((event: string, cb: (status: AppStateStatus) => void) => {
        if (event === 'change') listener = cb;
        return mockSub;
      }) as typeof AppState.addEventListener,
    );
  });

  afterEach(() => {
    addEventSpy.mockRestore();
  });

  function Probe(): null {
    useAppLifecycle();
    return null;
  }

  it("subscribes to AppState 'change' on mount and triggers runLifecycleOnce", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });
    expect(addEventSpy).toHaveBeenCalledWith('change', expect.any(Function));
    expect(listener).toBeDefined();
    // The mount-time runLifecycleOnce call drove syncYearly + registerDevice.
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => tree?.unmount());
  });

  it("re-runs the lifecycle when the listener fires with 'active'", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });
    syncMock.mockClear();
    registerMock.mockClear();

    await TestRenderer.act(async () => {
      listener?.('active');
    });

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => tree?.unmount());
  });

  it("does NOT re-run the lifecycle when the listener fires with 'background' or 'inactive'", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });
    syncMock.mockClear();
    registerMock.mockClear();

    await TestRenderer.act(async () => {
      listener?.('background');
      listener?.('inactive');
    });

    expect(syncMock).not.toHaveBeenCalled();
    expect(registerMock).not.toHaveBeenCalled();
    await TestRenderer.act(async () => tree?.unmount());
  });

  it('removes the subscription on unmount', async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });
    expect(mockSub.remove).not.toHaveBeenCalled();
    await TestRenderer.act(async () => tree?.unmount());
    expect(mockSub.remove).toHaveBeenCalledTimes(1);
  });
});
