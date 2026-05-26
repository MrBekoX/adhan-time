import { ApiError, ApiNotFoundError, NetworkError } from '../errors';
import { ezanvakti } from '../ezanvaktiClient';

import { API_TIMEOUT_MS } from '@/constants/api';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function envelope<T>(data: T): { success: true; code: number; message: string; data: T } {
  return { success: true, code: 0, message: 'ok', data };
}

function jsonRes(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function plainRes(body: string, init: { status: number; headers?: Record<string, string> }): Response {
  return new Response(body, {
    status: init.status,
    headers: init.headers ?? { 'Content-Type': 'text/plain' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  jest.useRealTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('ezanvaktiClient withRetry integration (V1)', () => {
  it('retries 5xx then succeeds (3 total fetch calls)', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(plainRes('boom', { status: 503 }))
      .mockResolvedValueOnce(plainRes('boom', { status: 502 }))
      .mockResolvedValueOnce(jsonRes(envelope([])));

    const promise = ezanvakti.countries();
    // Drain the two backoff sleeps (1s + 2s).
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('honors Retry-After on 429', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(plainRes('rate limited', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(jsonRes(envelope([])));

    const promise = ezanvakti.countries();
    await jest.advanceTimersByTimeAsync(2_000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 4xx (404)', async () => {
    fetchMock.mockResolvedValueOnce(plainRes('not found', { status: 404 }));

    await expect(ezanvakti.countries()).rejects.toBeInstanceOf(ApiNotFoundError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 4xx (400)', async () => {
    fetchMock.mockResolvedValueOnce(plainRes('bad request', { status: 400 }));

    await expect(ezanvakti.countries()).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 retries on persistent 5xx', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(plainRes('boom', { status: 503 }));

    const promise = ezanvakti.countries().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await jest.advanceTimersByTimeAsync(4_000);
    const err = await promise;

    expect(err).toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('unwraps the envelope and returns data', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(envelope([{ _id: '1', name: 'X', name_en: 'X' }])));

    const result = await ezanvakti.countries();

    expect(result).toEqual([{ _id: '1', name: 'X', name_en: 'X' }]);
  });

  it('wraps invalid JSON responses as ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{bad-json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await expect(ezanvakti.countries()).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects malformed prayer-time rows before callers can cache them', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes(
        envelope([
          {
            date: '2026-05-27',
            times: {
              imsak: '04:00',
            },
          },
        ]),
      ),
    );

    await expect(ezanvakti.prayerTimesYearly('9541')).rejects.toThrow(/prayer/i);
  });

  it('rejects searchStates results that do not belong to the requested country', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes(envelope([{ _id: 'x', name: 'Paris', name_en: 'Paris', country_id: '33' }])),
    );

    await expect(ezanvakti.searchStates('21', 'paris')).rejects.toThrow(/country/i);
  });

  it('rejects searchDistricts results that do not belong to the requested state', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes(
        envelope([
          {
            _id: 'medina-oh',
            name: 'Medina',
            name_en: 'Medina',
            country_id: '33',
            state_id: 'ohio',
          },
        ]),
      ),
    );

    await expect(ezanvakti.searchDistricts('saudi-medina-state', 'medina')).rejects.toThrow(/state/i);
  });

  it('aborts slow API calls instead of waiting forever', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const promise = ezanvakti.countries().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    await jest.advanceTimersByTimeAsync(2_000);
    await jest.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    await jest.advanceTimersByTimeAsync(4_000);
    await jest.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    const err = await promise;

    expect(err).toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
