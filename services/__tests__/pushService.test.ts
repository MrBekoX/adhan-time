/**
 * Issue #13: getExpoPushToken now returns a discriminated TokenResult so a
 * fetch-failed transient (Expo SDK couldn't issue a token despite the user
 * having push permission ON) can be distinguished from a permission-denied
 * case. Without that distinction, useAppLifecycle silently dropped the
 * device's server-side push fallback whenever Expo's SDK hiccuped.
 */
import * as Notifications from 'expo-notifications';

import { getExpoPushToken } from '../pushService';

const deviceState = { isDevice: true };

jest.mock('expo-device', () => ({
  get isDevice() {
    return deviceState.isDevice;
  },
}));

const getPermsMock = Notifications.getPermissionsAsync as jest.Mock;
const requestPermsMock = Notifications.requestPermissionsAsync as jest.Mock;
const getTokenAsyncMock = Notifications.getExpoPushTokenAsync as jest.Mock;

beforeEach(() => {
  deviceState.isDevice = true;
  getPermsMock.mockReset().mockResolvedValue({ status: 'granted' });
  requestPermsMock.mockReset().mockResolvedValue({ status: 'granted' });
  getTokenAsyncMock.mockReset().mockResolvedValue({ data: 'ExponentPushToken[xyz]' });
});

describe('getExpoPushToken — discriminated TokenResult (Issue #13)', () => {
  it('returns ok=true with the token string when everything succeeds', async () => {
    const result = await getExpoPushToken();
    expect(result).toEqual({ ok: true, token: 'ExponentPushToken[xyz]' });
  });

  it("returns reason='simulator' when Device.isDevice is false (no SDK call)", async () => {
    deviceState.isDevice = false;

    const result = await getExpoPushToken();

    expect(result).toEqual({ ok: false, reason: 'simulator' });
    expect(getTokenAsyncMock).not.toHaveBeenCalled();
  });

  it("returns reason='permission-denied' when permission was rejected (no SDK call)", async () => {
    getPermsMock.mockResolvedValueOnce({ status: 'denied' });
    requestPermsMock.mockResolvedValueOnce({ status: 'denied' });

    const result = await getExpoPushToken();

    expect(result).toEqual({ ok: false, reason: 'permission-denied' });
    expect(getTokenAsyncMock).not.toHaveBeenCalled();
  });

  it("returns reason='fetch-failed' with the underlying error when getExpoPushTokenAsync throws", async () => {
    getTokenAsyncMock.mockRejectedValueOnce(new Error('expo-backend-503'));

    const result = await getExpoPushToken();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('fetch-failed');
    if (result.reason !== 'fetch-failed') throw new Error('narrow failed');
    expect(result.error).toContain('expo-backend-503');
  });
});
