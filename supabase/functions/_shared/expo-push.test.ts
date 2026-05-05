import { buildDeviceErrorLog, processBatchResponse, type Pair } from './expo-push';

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

function pair(token: string, deviceId: string, prayerKey = 'imsak', localDate = '2026-05-04'): Pair {
  return {
    message: { to: token, title: 'T', body: 'B' },
    log: {
      device_id: deviceId,
      prayer_key: prayerKey,
      scheduled_for: '2026-05-04T03:30:00.000Z',
      local_date: localDate,
    },
  };
}

describe('processBatchResponse', () => {
  it('attaches ticket ids to logs when all pushes succeed', () => {
    const pairs = [pair(TOKEN_A, 'd-a'), pair(TOKEN_B, 'd-b')];
    const result = processBatchResponse(pairs, {
      ok: true,
      body: {
        data: [
          { status: 'ok', id: 'tk-1' },
          { status: 'ok', id: 'tk-2' },
        ],
      },
    });
    expect(result.tokensToRemove).toEqual([]);
    expect(result.rateLimitedTokens).toEqual([]);
    expect(result.enrichedLogs[0].expo_response).toEqual({ status: 'ok', id: 'tk-1' });
    expect(result.enrichedLogs[1].expo_response).toEqual({ status: 'ok', id: 'tk-2' });
  });

  it('queues a token for deletion when its ticket is DeviceNotRegistered', () => {
    const pairs = [pair(TOKEN_A, 'd-a'), pair(TOKEN_B, 'd-b')];
    const result = processBatchResponse(pairs, {
      ok: true,
      body: {
        data: [
          { status: 'ok', id: 'tk-1' },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        ],
      },
    });
    expect(result.tokensToRemove).toEqual([TOKEN_B]);
    expect(result.enrichedLogs[1].expo_response).toMatchObject({
      status: 'error',
      details: { error: 'DeviceNotRegistered' },
    });
  });

  it('deduplicates DeviceNotRegistered tokens that appear in multiple messages', () => {
    const pairs = [
      pair(TOKEN_A, 'd-a', 'imsak'),
      pair(TOKEN_A, 'd-a', 'gunes'),
    ];
    const result = processBatchResponse(pairs, {
      ok: true,
      body: {
        data: [
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ],
      },
    });
    expect(result.tokensToRemove).toEqual([TOKEN_A]);
  });

  it('records MessageRateExceeded separately and does not delete the device', () => {
    const pairs = [pair(TOKEN_A, 'd-a')];
    const result = processBatchResponse(pairs, {
      ok: true,
      body: {
        data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }],
      },
    });
    expect(result.tokensToRemove).toEqual([]);
    expect(result.rateLimitedTokens).toEqual([TOKEN_A]);
  });

  it('does not delete on unknown error codes (only enriches the log)', () => {
    const pairs = [pair(TOKEN_A, 'd-a')];
    const result = processBatchResponse(pairs, {
      ok: true,
      body: {
        data: [{ status: 'error', details: { error: 'InvalidCredentials' } }],
      },
    });
    expect(result.tokensToRemove).toEqual([]);
    expect(result.rateLimitedTokens).toEqual([]);
    expect(result.enrichedLogs[0].expo_response).toMatchObject({
      status: 'error',
      details: { error: 'InvalidCredentials' },
    });
  });

  it('marks every log as transport-failed when the HTTP response was non-2xx', () => {
    const pairs = [pair(TOKEN_A, 'd-a'), pair(TOKEN_B, 'd-b')];
    const result = processBatchResponse(pairs, { ok: false, status: 503 });
    expect(result.tokensToRemove).toEqual([]);
    expect(result.enrichedLogs.every((l) => (l.expo_response as { status: string }).status === 'error')).toBe(true);
    expect(result.enrichedLogs[0].expo_response).toMatchObject({ status: 'error', message: expect.stringContaining('503') });
  });

  it('marks logs as missing-ticket when the response body has no data array', () => {
    const pairs = [pair(TOKEN_A, 'd-a')];
    const result = processBatchResponse(pairs, { ok: true, body: { errors: [{ code: 'malformed' }] } });
    expect(result.tokensToRemove).toEqual([]);
    expect(result.enrichedLogs[0].expo_response).toMatchObject({ status: 'error', message: expect.stringContaining('missing') });
  });

  it('marks one log as missing-ticket when the data array is shorter than the batch', () => {
    const pairs = [pair(TOKEN_A, 'd-a'), pair(TOKEN_B, 'd-b')];
    const result = processBatchResponse(pairs, {
      ok: true,
      body: { data: [{ status: 'ok', id: 'tk-1' }] },
    });
    expect((result.enrichedLogs[0].expo_response as { status: string }).status).toBe('ok');
    expect((result.enrichedLogs[1].expo_response as { status: string }).status).toBe('error');
  });

  it('uses a custom reason in the log message when the caller supplies one (parse-failed)', () => {
    // An HTTP 200 with a malformed body must not be treated like a clean
    // success — every log should record the parse-failed reason so ops
    // can distinguish "Expo down" from "we sent garbage".
    const pairs = [pair(TOKEN_A, 'd-a'), pair(TOKEN_B, 'd-b')];
    const result = processBatchResponse(pairs, {
      ok: false,
      status: 200,
      reason: 'body-parse-failed',
    });
    expect(result.tokensToRemove).toEqual([]);
    expect(result.enrichedLogs.every((l) => (l.expo_response as { status: string }).status === 'error')).toBe(true);
    expect(
      result.enrichedLogs[0].expo_response,
    ).toMatchObject({ status: 'error', message: 'body-parse-failed' });
  });
});

describe('buildDeviceErrorLog (Issue #8 — per-device cron-loop audit)', () => {
  it('produces a push_log row tagged with the _system prayer key', () => {
    const now = new Date('2026-05-04T03:30:00.000Z');
    const row = buildDeviceErrorLog('dev-42', now, new Error('bad-tz'));
    expect(row).toEqual({
      device_id: 'dev-42',
      prayer_key: '_system',
      scheduled_for: now.toISOString(),
      local_date: '2026-05-04',
      expo_response: { status: 'error', message: 'device-loop-error: Error: bad-tz' },
    });
  });

  it('honors a caller-supplied tz-aware local date when available', () => {
    const now = new Date('2026-05-04T20:30:00.000Z'); // already 05-05 in Asia/Tokyo
    const row = buildDeviceErrorLog('dev-tokyo', now, 'fetch-503', '2026-05-05');
    expect(row.local_date).toBe('2026-05-05');
  });

  it('falls back to the UTC date when no local-date hint is given', () => {
    const now = new Date('2026-05-04T20:30:00.000Z');
    const row = buildDeviceErrorLog('dev-x', now, 'whatever');
    expect(row.local_date).toBe('2026-05-04');
  });

  it('coerces non-Error throws into a string-safe message', () => {
    const row = buildDeviceErrorLog('dev-y', new Date(), { code: 'weird-shape' });
    expect((row.expo_response as { message: string }).message).toContain('device-loop-error:');
  });
});
