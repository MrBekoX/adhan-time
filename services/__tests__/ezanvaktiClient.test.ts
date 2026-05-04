import { ApiError, ApiNotFoundError } from '../errors';
import { ezanvakti } from '../ezanvaktiClient';

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
});
