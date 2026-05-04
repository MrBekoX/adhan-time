import { processBatchResponse, type Pair } from './expo-push';

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
});
