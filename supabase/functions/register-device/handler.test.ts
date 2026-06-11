import { computeBodyHmac } from '../_shared/hmac';
import type { RateLimitClient, RateLimitRow } from '../_shared/rate-limit';
import type { ValidPayload } from '../_shared/validators';

import { handleRegisterDevice, type RegisterDeps } from './handler';

const validBody = {
  expoPushToken: 'ExponentPushToken[abcdefghij1234567890_-]',
  districtId: '9541',
  districtName: 'Üsküdar',
  countryName: 'Türkiye',
  timezone: 'Europe/Istanbul',
  locale: 'tr',
  sound: 'default',
  enabledPrayers: ['imsak', 'gunes'],
};

class FakeRateLimit implements RateLimitClient {
  rows = new Map<string, RateLimitRow>();
  always: 'allow' | 'deny' = 'allow';
  async read(ip: string): Promise<RateLimitRow | null> {
    if (this.always === 'deny') {
      return { ip_hash: ip, request_count: 999, window_start: new Date().toISOString() };
    }
    return this.rows.get(ip) ?? null;
  }
  async insert(row: RateLimitRow): Promise<void> {
    this.rows.set(row.ip_hash, row);
  }
  async increment(ip: string, count: number): Promise<void> {
    const row = this.rows.get(ip);
    if (row) this.rows.set(ip, { ...row, request_count: count });
  }
}

function makeDeps(overrides: Partial<RegisterDeps> = {}): RegisterDeps & {
  rateLimit: FakeRateLimit;
  upsertCalls: ValidPayload[];
} {
  const rateLimit = new FakeRateLimit();
  const upsertCalls: ValidPayload[] = [];
  return {
    rateLimit,
    upsertCalls,
    upsertDevice: async (payload) => {
      upsertCalls.push(payload);
      return { id: 'dev-123' };
    },
    hmacSecret: null,
    now: () => new Date('2026-05-04T10:00:00Z'),
    ...overrides,
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://x/functions/v1/register-device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '1.2.3.4', ...headers },
    body: JSON.stringify(body),
  });
}

async function signedJsonRequest(
  body: unknown,
  secret = 'topsecret',
  headers: Record<string, string> = {},
): Promise<Request> {
  const raw = JSON.stringify(body);
  return new Request('https://x/functions/v1/register-device', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': '1.2.3.4',
      'x-body-signature': await computeBodyHmac(raw, secret),
      ...headers,
    },
    body: raw,
  });
}

describe('handleRegisterDevice', () => {
  it('handles a CORS preflight without invoking the rate limiter or DB', async () => {
    const deps = makeDeps();
    const r = await handleRegisterDevice(
      new Request('https://x', { method: 'OPTIONS', headers: { 'x-real-ip': '1.2.3.4' } }),
      deps,
    );
    expect(r.status).toBe(204);
    expect(deps.upsertCalls).toHaveLength(0);
    // CORS narrowed: not '*'
    expect(r.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('rejects non-POST methods with 405', async () => {
    const deps = makeDeps();
    const r = await handleRegisterDevice(
      new Request('https://x', { method: 'GET', headers: { 'x-real-ip': '1.2.3.4' } }),
      deps,
    );
    expect(r.status).toBe(405);
  });

  it('returns 200 + id on a valid payload', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    const r = await handleRegisterDevice(await signedJsonRequest(validBody), deps);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: 'dev-123' });
    expect(deps.upsertCalls).toHaveLength(1);
    expect(deps.upsertCalls[0]).toMatchObject({
      expoPushToken: validBody.expoPushToken,
      districtId: validBody.districtId,
      timezone: 'Europe/Istanbul',
    });
  });

  it('passes optional deviceId/platform/batteryExempt through to upsertDevice', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    const r = await handleRegisterDevice(
      await signedJsonRequest({
        ...validBody,
        deviceId: 'a1b2c3d4e5f60718',
        platform: 'android',
        batteryExempt: false,
      }),
      deps,
    );
    expect(r.status).toBe(200);
    expect(deps.upsertCalls[0]).toMatchObject({
      deviceId: 'a1b2c3d4e5f60718',
      platform: 'android',
      batteryExempt: false,
    });
  });

  it('returns 400 invalid_token on a malformed token', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    const r = await handleRegisterDevice(await signedJsonRequest({ ...validBody, expoPushToken: 'hack' }), deps);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_token' });
    expect(deps.upsertCalls).toHaveLength(0);
  });

  it('returns 400 invalid_timezone on a bogus tz', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    const r = await handleRegisterDevice(await signedJsonRequest({ ...validBody, timezone: 'Mars/Phobos' }), deps);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_timezone' });
  });

  it('returns 400 invalid_locale on an unsupported locale', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    const r = await handleRegisterDevice(await signedJsonRequest({ ...validBody, locale: 'fr' }), deps);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_locale' });
  });

  it('returns 400 invalid_body on malformed JSON', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    const raw = '{not valid';
    const r = await handleRegisterDevice(
      new Request('https://x', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': '1.2.3.4',
          'x-body-signature': await computeBodyHmac(raw, 'topsecret'),
        },
        body: raw,
      }),
      deps,
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_body' });
  });

  it('returns 429 when the rate limiter denies', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    deps.rateLimit.always = 'deny';
    const r = await handleRegisterDevice(await signedJsonRequest(validBody), deps);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'rate_limited' });
    expect(deps.upsertCalls).toHaveLength(0);
  });

  it('returns 401 when HMAC is required but signature is missing', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    const r = await handleRegisterDevice(jsonRequest(validBody), deps);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'invalid_signature' });
    expect(deps.upsertCalls).toHaveLength(0);
  });

  it('returns 401 when HMAC signature is wrong', async () => {
    const deps = makeDeps({ hmacSecret: 'topsecret' });
    const r = await handleRegisterDevice(jsonRequest(validBody, { 'x-body-signature': 'a'.repeat(64) }), deps);
    expect(r.status).toBe(401);
  });

  it('accepts a valid HMAC signature', async () => {
    const secret = 'topsecret';
    const deps = makeDeps({ hmacSecret: secret });
    const raw = JSON.stringify(validBody);
    const sig = await computeBodyHmac(raw, secret);
    const r = await handleRegisterDevice(
      new Request('https://x', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': '1.2.3.4',
          'x-body-signature': sig,
        },
        body: raw,
      }),
      deps,
    );
    expect(r.status).toBe(200);
    expect(deps.upsertCalls).toHaveLength(1);
  });

  it('returns 500 db_error when upsert fails', async () => {
    const deps = makeDeps({
      hmacSecret: 'topsecret',
      upsertDevice: async () => ({ error: 'connection refused' }),
    });
    const r = await handleRegisterDevice(await signedJsonRequest(validBody), deps);
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'db_error' });
  });

  it('does not consume rate limit budget on preflight', async () => {
    const deps = makeDeps();
    await handleRegisterDevice(
      new Request('https://x', { method: 'OPTIONS', headers: { 'x-real-ip': '1.2.3.4' } }),
      deps,
    );
    expect(deps.rateLimit.rows.size).toBe(0);
  });

  it('fails closed when the server HMAC secret is not configured', async () => {
    const deps = makeDeps({ hmacSecret: null });
    const r = await handleRegisterDevice(jsonRequest(validBody), deps);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'hmac_secret_not_configured' });
    expect(deps.upsertCalls).toHaveLength(0);
    expect(deps.rateLimit.rows.size).toBe(0);
  });
});
