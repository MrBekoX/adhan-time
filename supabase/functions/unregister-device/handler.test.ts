import { handleUnregisterDevice, type UnregisterDeps } from './handler';

const VALID_TOKEN = 'ExponentPushToken[abcdefghij1234567890_-]';

function makeDeps(overrides: Partial<UnregisterDeps> = {}): UnregisterDeps & {
  deleteCalls: string[];
} {
  const deleteCalls: string[] = [];
  return {
    deleteCalls,
    deleteByToken: async (token) => {
      deleteCalls.push(token);
    },
    ...overrides,
  };
}

function jsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://x/functions/v1/unregister-device', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
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

  it('deletes the device row on a valid token', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      jsonRequest({ expoPushToken: VALID_TOKEN }),
      deps,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(deps.deleteCalls).toEqual([VALID_TOKEN]);
  });

  it('returns 400 invalid_token on a malformed token', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(
      jsonRequest({ expoPushToken: 'hack' }),
      deps,
    );
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_token' });
    expect(deps.deleteCalls).toHaveLength(0);
  });

  it('returns 400 invalid_token when token is missing', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(jsonRequest({}), deps);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_token' });
  });

  it('returns 400 invalid_body on malformed JSON', async () => {
    const deps = makeDeps();
    const r = await handleUnregisterDevice(jsonRequest('not json'), deps);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_body' });
  });

  it('returns 500 db_error when delete throws', async () => {
    const deps = makeDeps({
      deleteByToken: async () => {
        throw new Error('connection refused');
      },
    });
    const r = await handleUnregisterDevice(
      jsonRequest({ expoPushToken: VALID_TOKEN }),
      deps,
    );
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'db_error' });
  });
});
