import { computeBodyHmac } from '../../supabase/functions/_shared/hmac';
import { registerDevice } from '../deviceRegistry';
import { signRegisterBody } from '../deviceRegistry.signing';
import { getExpoPushToken } from '../pushService';

jest.mock('../supabaseClient', () => ({
  supabase: {},
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
}));

jest.mock('../pushService', () => ({
  getExpoPushToken: jest.fn(),
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

describe('registerDevice — V16 retry + F6 boolean return', () => {
  const VALID_INPUT = {
    districtId: '9541',
    districtName: 'Istanbul',
    countryName: 'TÜRKİYE',
    timezone: 'Europe/Istanbul',
    locale: 'tr',
    sound: 'default',
    enabledPrayers: ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'],
  };

  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    getTokenMock.mockReset().mockResolvedValue('ExponentPushToken[abc123]');
    // 0ms backoff so the test runs in real-time without fake-timer plumbing.
    process.env.REGISTER_DEVICE_BASE_DELAY_MS = '0';
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env.REGISTER_DEVICE_BASE_DELAY_MS;
  });

  it('returns ok=true on a single 2xx response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, id: 'dev-1' }), { status: 200 }),
    );

    const result = await registerDevice(VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 times on transient 5xx, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await registerDevice(VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns ok=false reason='transient' after 3 retries when every attempt fails with 5xx", async () => {
    fetchMock.mockResolvedValue(new Response('still failing', { status: 500 }));

    const result = await registerDevice(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'transient' });
    // withRetry default `retries: 3` produces up to 4 total attempts.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("returns ok=false reason='transient' on persistent network failure", async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await registerDevice(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'transient' });
  });

  it("returns ok=false reason='no-token' (not retried) when no Expo push token is available", async () => {
    getTokenMock.mockResolvedValueOnce(null);

    const result = await registerDevice(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'no-token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok=false reason='incompatible' on 4xx (client error — retry will not help)", async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad payload', { status: 400 }));

    const result = await registerDevice(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'incompatible', status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports the actual 4xx status code so admin can distinguish 401 vs 403 vs 422', async () => {
    fetchMock.mockResolvedValueOnce(new Response('hmac fail', { status: 401 }));

    const result = await registerDevice(VALID_INPUT);

    expect(result).toEqual({ ok: false, reason: 'incompatible', status: 401 });
  });
});
