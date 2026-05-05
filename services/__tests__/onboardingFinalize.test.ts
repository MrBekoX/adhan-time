import { registerDevice } from '../deviceRegistry';
import { ensureAndroidChannel } from '../notificationScheduler';
import { finalizeOnboarding } from '../onboardingFinalize';
import { syncYearly } from '../prayerService';
import { requestPermission } from '../pushService';

import type { PersistedLocation } from '@/store/locationStore.migration';

jest.mock('../pushService', () => ({
  requestPermission: jest.fn(),
}));

jest.mock('../notificationScheduler', () => ({
  ensureAndroidChannel: jest.fn(),
}));

jest.mock('../prayerService', () => ({
  syncYearly: jest.fn(),
}));

jest.mock('../deviceRegistry', () => ({
  registerDevice: jest.fn(),
}));

const requestPermissionMock = requestPermission as jest.Mock;
const ensureChannelMock = ensureAndroidChannel as jest.Mock;
const syncYearlyMock = syncYearly as jest.Mock;
const registerMock = registerDevice as jest.Mock;

const LOCATION: PersistedLocation = {
  countryId: '2',
  countryName: 'TÜRKİYE',
  stateId: '506',
  stateName: 'Istanbul',
  districtId: '9541',
  districtName: 'Istanbul',
  timezone: 'Europe/Istanbul',
};

const INPUT = {
  location: LOCATION,
  locale: 'tr',
  sound: 'default',
  enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
};

beforeEach(() => {
  requestPermissionMock.mockReset().mockResolvedValue(true);
  ensureChannelMock.mockReset().mockResolvedValue(undefined);
  syncYearlyMock.mockReset().mockResolvedValue({ entries: [] });
  registerMock.mockReset().mockResolvedValue(undefined);
});

describe('finalizeOnboarding (V5)', () => {
  it('returns ok:true with permissionGranted=true on the happy path', async () => {
    const result = await finalizeOnboarding(INPUT);
    expect(result).toEqual({ ok: true, permissionGranted: true });
    expect(syncYearlyMock).toHaveBeenCalledWith('9541', 'Istanbul', 'Europe/Istanbul', { force: true });
    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  it('returns ok:true with permissionGranted=false when the OS permission was denied', async () => {
    requestPermissionMock.mockResolvedValue(false);
    const result = await finalizeOnboarding(INPUT);
    // The user denied the OS prompt, but everything else still succeeded —
    // the screen completes onboarding and shows a persistent banner.
    expect(result).toEqual({ ok: true, permissionGranted: false });
  });

  it('returns ok:false when syncYearly rejects (network down on Finish tap)', async () => {
    syncYearlyMock.mockRejectedValue(new Error('network'));
    const result = await finalizeOnboarding(INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(String(result.error)).toContain('network');
    }
    // registerDevice must not run when sync failed — we have nothing to schedule.
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('does NOT swallow a registerDevice exception (kept as ok:false for retry)', async () => {
    // Contract: any throw from registerDevice must produce ok:false on the
    // orchestration result, not a silently completed onboarding. The
    // current registerDevice catches its own network errors, but this test
    // pins the orchestration's behavior under the contract regardless.
    registerMock.mockRejectedValue(new Error('register-500'));
    const result = await finalizeOnboarding(INPUT);
    expect(result.ok).toBe(false);
  });

  it('orders the side effects: permission → channel → sync → register', async () => {
    const calls: string[] = [];
    requestPermissionMock.mockImplementation(async () => {
      calls.push('permission');
      return true;
    });
    ensureChannelMock.mockImplementation(async () => {
      calls.push('channel');
    });
    syncYearlyMock.mockImplementation(async () => {
      calls.push('sync');
      return { entries: [] };
    });
    registerMock.mockImplementation(async () => {
      calls.push('register');
    });

    await finalizeOnboarding(INPUT);
    expect(calls).toEqual(['permission', 'channel', 'sync', 'register']);
  });
});
