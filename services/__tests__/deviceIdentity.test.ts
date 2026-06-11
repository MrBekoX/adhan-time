import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { getDeviceId } from '../deviceIdentity';

const androidIdMock = Application.getAndroidId as jest.Mock;
const idfvMock = Application.getIosIdForVendorAsync as jest.Mock;
const realOS = Platform.OS;

function withOS(os: 'android' | 'ios'): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
  jest.clearAllMocks();
});

describe('getDeviceId', () => {
  it('returns the Android ID on Android', async () => {
    withOS('android');
    androidIdMock.mockReturnValue('a1b2c3d4e5f60718');
    await expect(getDeviceId()).resolves.toBe('a1b2c3d4e5f60718');
  });

  it('returns the IDFV on iOS', async () => {
    withOS('ios');
    idfvMock.mockResolvedValue('E621E1F8-C36C-495A-93FC-0C247A3E6E5F');
    await expect(getDeviceId()).resolves.toBe('E621E1F8-C36C-495A-93FC-0C247A3E6E5F');
  });

  it('returns null when the IDFV is momentarily nil', async () => {
    withOS('ios');
    idfvMock.mockResolvedValue(null);
    await expect(getDeviceId()).resolves.toBeNull();
  });

  it('returns null (never throws) when the native getter throws', async () => {
    withOS('android');
    androidIdMock.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(getDeviceId()).resolves.toBeNull();
  });

  // An off-spec native id (some OEM/rooted ROMs) must NOT reach the server: it
  // would fail the edge validator (DEVICE_ID_RE) → 400 → a permanent
  // "incompatible" banner with no retry → the device silently loses its server
  // push fallback. deviceId is optional/best-effort, so degrade to null instead.
  it('returns null when the Android id has characters outside the server charset', async () => {
    withOS('android');
    androidIdMock.mockReturnValue('bad.id:with/chars');
    await expect(getDeviceId()).resolves.toBeNull();
  });

  it('returns null when the id is too short for the server charset', async () => {
    withOS('android');
    androidIdMock.mockReturnValue('short');
    await expect(getDeviceId()).resolves.toBeNull();
  });
});
