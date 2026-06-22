import { computeBodyHmac } from '../../supabase/functions/_shared/hmac';
import { isBatteryExempt } from '../batteryOptimization';
import { registerDevice, registerDeviceDetailed, unregisterDevice } from '../deviceRegistry';
import { signRegisterBody } from '../deviceRegistry.signing';
import { getDeviceId } from '../deviceIdentity';
import { getExpoPushToken } from '../pushService';

jest.mock('../supabaseClient', () => ({
  supabase: {},
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
}));

jest.mock('../pushService', () => ({
  getExpoPushToken: jest.fn(),
}));

jest.mock('../deviceIdentity', () => ({
  getDeviceId: jest.fn(async () => 'a1b2c3d4e5f60718'),
}));
jest.mock('../batteryOptimization', () => ({
  isBatteryExempt: jest.fn(async () => false),
}));

const getTokenMock = getExpoPushToken as jest.Mock;

describe('signRegisterBody', () => {
  it('produces a 64-char hex HMAC-SHA256 of the JSON body', () => {
    const sig = signRegisterBody('{"a":1}', 'topsecret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('matches the edge-function verifier (computeBodyHmac)', async () => {
    const body = '{"hello":"world","n":42}';
    const secret = 'shared-key-2026';
    const mobile = signRegisterBody(body, secret);
    const edge = await computeBodyHmac(body, secret);
    expect(mobile).toBe(edge);
  });

  it('returns null when the secret is empty', () => {
    expect(signRegisterBody('{"a":1}', '')).toBeNull();
    expect(signRegisterBody('{"a":1}', undefined)).toBeNull();
  });
});

describe('registerDeviceDetailed — V16 retry + UI reason surface', () => {
  const VALID_INPUT = {
    districtId: '9541',
    districtName: 'Istanbul',
    countryName: 'TÜRKİYE',
    timezone: 'Europe/Istanbul',
    locale: 'tr',
    sound: 'default',
    enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
    reminderMinutes: 0,
  };

  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY = 'topsecret';
    getTokenMock
      .mockReset()
      .mockResolvedValue({ ok: true, token: 'ExponentPushToken[abc123]' });
    // 0ms backoff so the test runs in real-time without fake-timer plumbing.
    process.env.REGISTER_DEVICE_BASE_DELAY_MS = '0';
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env.REGISTER_DEVICE_BASE_DELAY_MS;
    delete process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY;
  });

  it('returns ok=true on a single 2xx response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, id: 'dev-1' }), { status: 200 }),
    );

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enriches the register body with deviceId, platform, and batteryExempt', async () => {
    (getDeviceId as jest.Mock).mockResolvedValueOnce('a1b2c3d4e5f60718');
    (isBatteryExempt as jest.Mock).mockResolvedValueOnce(false);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await registerDeviceDetailed(VALID_INPUT);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toMatchObject({
      deviceId: 'a1b2c3d4e5f60718',
      platform: expect.stringMatching(/^(android|ios)$/),
      batteryExempt: false,
      expoPushToken: 'ExponentPushToken[abc123]',
    });
  });

  it('omits deviceId when unavailable and batteryExempt when undefined', async () => {
    (getDeviceId as jest.Mock).mockResolvedValueOnce(null);
    (isBatteryExempt as jest.Mock).mockResolvedValueOnce(undefined);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await registerDeviceDetailed(VALID_INPUT);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.deviceId).toBeUndefined();
    expect(sent.batteryExempt).toBeUndefined();
    expect(sent.platform).toMatch(/^(android|ios)$/); // platform always sent
  });

  it('retries up to 3 times on transient 5xx, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns ok=false reason='transient' after 3 retries when every attempt fails with 5xx", async () => {
    fetchMock.mockResolvedValue(new Response('still failing', { status: 500 }));

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'transient' });
    // withRetry default `retries: 3` produces up to 4 total attempts.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("returns ok=false reason='transient' on persistent network failure", async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'transient' });
  });

  it("returns ok=false reason='no-token' when permission was denied (V5 surfaces it elsewhere)", async () => {
    getTokenMock.mockResolvedValueOnce({ ok: false, reason: 'permission-denied' });

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'no-token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok=false reason='no-token' when running on a simulator (push not supported)", async () => {
    getTokenMock.mockResolvedValueOnce({ ok: false, reason: 'simulator' });

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'no-token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok=false reason='token-fetch-failed' when Expo's getExpoPushTokenAsync throws", async () => {
    // Distinct from permission-denied: the user has push permission ON
    // but Expo's SDK couldn't issue a token (network blip, projectId
    // misconfigured, Expo backend hiccup). Treat as transient — the next
    // foreground tick retries.
    getTokenMock.mockResolvedValueOnce({
      ok: false,
      reason: 'fetch-failed',
      error: 'expo-backend-503',
    });

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'token-fetch-failed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok=false reason='incompatible' on 4xx (client error — retry will not help)", async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad payload', { status: 400 }));

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'incompatible', status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the actual 4xx status code so admin can distinguish 401 vs 403 vs 422', async () => {
    fetchMock.mockResolvedValueOnce(new Response('hmac fail', { status: 401 }));

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'incompatible', status: 401 });
  });

  it('skips server registration when the client proof key is not configured', async () => {
    delete process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY;

    const result = await registerDeviceDetailed(VALID_INPUT);

    expect(result).toEqual({
      ok: false,
      reason: 'registration-disabled',
      code: 'missing-client-hmac',
    });
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not log 4xx registration responses with console.error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(new Response('hmac fail', { status: 401 }));

    await registerDeviceDetailed(VALID_INPUT);

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('registerDevice — F6 boolean wrapper', () => {
  const VALID_INPUT = {
    districtId: '9541',
    districtName: 'Istanbul',
    countryName: 'TÃœRKÄ°YE',
    timezone: 'Europe/Istanbul',
    locale: 'tr',
    sound: 'default',
    enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
    reminderMinutes: 0,
  };

  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY = 'topsecret';
    getTokenMock
      .mockReset()
      .mockResolvedValue({ ok: true, token: 'ExponentPushToken[abc123]' });
    process.env.REGISTER_DEVICE_BASE_DELAY_MS = '0';
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env.REGISTER_DEVICE_BASE_DELAY_MS;
    delete process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY;
  });

  it('returns true when detailed registration succeeds', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(registerDevice(VALID_INPUT)).resolves.toBe(true);
  });

  it('returns false when detailed registration fails', async () => {
    fetchMock.mockResolvedValue(new Response('still failing', { status: 500 }));
    await expect(registerDevice(VALID_INPUT)).resolves.toBe(false);
  });
});

describe('unregisterDevice', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY = 'topsecret';
    getTokenMock
      .mockReset()
      .mockResolvedValue({ ok: true, token: 'ExponentPushToken[abc123]' });
    (getDeviceId as jest.Mock).mockResolvedValue('a1b2c3d4e5f60718');
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env.EXPO_PUBLIC_REGISTER_HMAC_KEY;
  });

  it('sends a signed token + deviceId delete request', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(unregisterDevice()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    expect(JSON.parse(body)).toEqual({
      expoPushToken: 'ExponentPushToken[abc123]',
      deviceId: 'a1b2c3d4e5f60718',
    });
    expect(headers['x-body-signature']).toBe(signRegisterBody(body, 'topsecret'));
  });

  it('skips the server delete when deviceId is unavailable', async () => {
    (getDeviceId as jest.Mock).mockResolvedValueOnce(null);

    await expect(unregisterDevice()).resolves.toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
