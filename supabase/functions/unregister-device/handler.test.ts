import { handleUnregisterDevice, type UnregisterDeps } from './handler';

import { computeBodyHmac } from '../_shared/hmac';
import type { RateLimitClient, RateLimitRow } from '../_shared/rate-limit';

const VALID_TOKEN = 'ExponentPushToken[abcdefghij1234567890_-]';
const VALID_DEVICE_ID = 'a1b2c3d4e5f60718';

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

function makeDeps(overrides: Partial<UnregisterDeps> = {}): UnregisterDeps & {
  rateLimit: FakeRateLimit;
  deleteCalls: Array<{ token: string; deviceId: string }>;
} {
  const rateLimit = new FakeRateLimit();
  const deleteCalls: Array<{ token: string; deviceId: string }> = [];
  return {
    rateLimit,
    deleteCalls,
    deleteByTokenAndDeviceId: async (token, deviceId) => {
      deleteCalls.push({ token, deviceId });
    },
    hmacSecret: 'topsecret',
    now: () => new Date('2026-05-04T10:00:00Z'),
    ...overrides,
  };
}

function unsignedJsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://x/functions/v1/unregister-device', {
    method,
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '1.2.3.4' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function signedJsonRequest(body: unknown, secret = 'topsecret'): Promise<Request> {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://x/functions/v1/unregister-device', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': '1.2.3.4',
      'x-body-signature': await computeBodyHmac(raw, secret),
    },
    body: raw,
  });
}

describe('handleUnregisterDevice', () => {
  it('handles a CORS preflight without invoking the DB', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      new Request('https://x', { method: 'OPTIONS' }),
      deps,
    );
    expect(r.status).toBe(204);
    expect(deps.deleteCalls).toHaveLength(0);
    expect(deps.rateLimit.rows.size).toBe(0);
  });

  it('rejects non-POST methods with 405', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      new Request('https://x', { method: 'GET' }),
      deps,
    );
    expect(r.status).toBe(405);
    expect(deps.deleteCalls).toHaveLength(0);
  });

  it('deletes the device row only when the token and deviceId are signed', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      await signedJsonRequest({ expoPushToken: VALID_TOKEN, deviceId: VALID_DEVICE_ID }),
      deps,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(deps.deleteCalls).toEqual([{ token: VALID_TOKEN, deviceId: VALID_DEVICE_ID }]);
  });

  it('returns 401 when HMAC is required but signature is missing', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      unsignedJsonRequest({ expoPushToken: VALID_TOKEN, deviceId: VALID_DEVICE_ID }),
      deps,
    );
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'invalid_signature' });
    expect(deps.deleteCalls).toHaveLength(0);
    expect(deps.rateLimit.rows.size).toBe(0);
  });

  it('fails closed when the server proof key is not configured', async () => {
    const deps = makeDeps({ hmacSecret: null });
    const r = await handleUnregisterDevice(
      unsignedJsonRequest({ expoPushToken: VALID_TOKEN, deviceId: VALID_DEVICE_ID }),
      deps,
    );
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'hmac_secret_not_configured' });
    expect(deps.deleteCalls).toHaveLength(0);
    expect(deps.rateLimit.rows.size).toBe(0);
  });

  it('returns 429 when the rate limiter denies', async () => {
    const deps = makeDeps();
    deps.rateLimit.always = 'deny';
    const r = await handleUnregisterDevice(
      await signedJsonRequest({ expoPushToken: VALID_TOKEN, deviceId: VALID_DEVICE_ID }),
      deps,
    );
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'rate_limited' });
    expect(deps.deleteCalls).toHaveLength(0);
  });

  it('returns 400 invalid_device_id when deviceId is missing', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      await signedJsonRequest({ expoPushToken: VALID_TOKEN }),
      deps,
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_device_id' });
    expect(deps.deleteCalls).toHaveLength(0);
  });

  it('returns 400 invalid_token on a malformed token', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      await signedJsonRequest({ expoPushToken: 'hack', deviceId: VALID_DEVICE_ID }),
      deps,
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_token' });
    expect(deps.deleteCalls).toHaveLength(0);
  });

  it('returns 400 invalid_token when token is missing', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      await signedJsonRequest({ deviceId: VALID_DEVICE_ID }),
      deps,
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_token' });
  });

  it('returns 400 invalid_body on malformed JSON', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(await signedJsonRequest('not json'), deps);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_body' });
  });

  it('returns 500 db_error when delete throws', async () => {
    const deps = makeDeps({
      deleteByTokenAndDeviceId: async () => {
        throw new Error('connection refused');
      },
    });
    const r = await handleUnregisterDevice(
      await signedJsonRequest({ expoPushToken: VALID_TOKEN, deviceId: VALID_DEVICE_ID }),
      deps,
    );
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'db_error' });
  });
});
