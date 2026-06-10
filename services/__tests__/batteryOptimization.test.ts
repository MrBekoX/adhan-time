import { Linking, Platform } from 'react-native';

import { requestBatteryExemption, shouldAskBatteryExemption } from '../batteryOptimization';

import * as IntentLauncher from 'expo-intent-launcher';

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(async () => ({ resultCode: 0 })),
  ActivityAction: {
    REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    IGNORE_BATTERY_OPTIMIZATION_SETTINGS: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { android: { package: 'com.adhantime.app' } } },
}));

const startActivity = IntentLauncher.startActivityAsync as jest.Mock;

function withPlatform(os: 'android' | 'ios', run: () => Promise<void> | void): Promise<void> {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  return Promise.resolve(run()).finally(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });
}

describe('shouldAskBatteryExemption', () => {
  it('is true only on Android when permission is granted and we have not asked before', () => {
    expect(
      shouldAskBatteryExemption({ isAndroid: true, permissionGranted: true, alreadyAsked: false }),
    ).toBe(true);
  });

  it('is false once already asked', () => {
    expect(
      shouldAskBatteryExemption({ isAndroid: true, permissionGranted: true, alreadyAsked: true }),
    ).toBe(false);
  });

  it('is false when notification permission was not granted', () => {
    expect(
      shouldAskBatteryExemption({ isAndroid: true, permissionGranted: false, alreadyAsked: false }),
    ).toBe(false);
  });

  it('is false on non-Android (iOS has no battery-optimization concept)', () => {
    expect(
      shouldAskBatteryExemption({ isAndroid: false, permissionGranted: true, alreadyAsked: false }),
    ).toBe(false);
  });
});

describe('requestBatteryExemption', () => {
  beforeEach(() => {
    startActivity.mockClear();
    startActivity.mockResolvedValue({ resultCode: 0 });
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('launches the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS system dialog with the package uri on Android', async () => {
    await withPlatform('android', async () => {
      await requestBatteryExemption();
    });
    expect(startActivity).toHaveBeenCalledTimes(1);
    expect(startActivity).toHaveBeenCalledWith(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: 'package:com.adhantime.app' },
    );
  });

  it('is a no-op on iOS (never launches an Android intent)', async () => {
    await withPlatform('ios', async () => {
      await requestBatteryExemption();
    });
    expect(startActivity).not.toHaveBeenCalled();
  });

  it('falls back to the battery-optimization list when the direct dialog is unavailable, without throwing', async () => {
    startActivity
      .mockRejectedValueOnce(new Error('ActivityNotFound'))
      .mockResolvedValueOnce({ resultCode: 0 });
    await withPlatform('android', async () => {
      await expect(requestBatteryExemption()).resolves.toBeUndefined();
    });
    expect(startActivity).toHaveBeenNthCalledWith(
      2,
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    );
  });

  it('falls back to app settings when both intents fail, and still never throws', async () => {
    startActivity.mockRejectedValue(new Error('ActivityNotFound'));
    await withPlatform('android', async () => {
      await expect(requestBatteryExemption()).resolves.toBeUndefined();
    });
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });
});
