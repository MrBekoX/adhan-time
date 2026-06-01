import { createAsyncDedupe } from './async-dedupe';

describe('createAsyncDedupe', () => {
  it('runs the factory once for concurrent calls with the same key', async () => {
    const dedupe = createAsyncDedupe<number>();
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.resolve(42);
    };
    const [a, b, c] = await Promise.all([
      dedupe('k', factory),
      dedupe('k', factory),
      dedupe('k', factory),
    ]);
    expect(calls).toBe(1);
    expect([a, b, c]).toEqual([42, 42, 42]);
  });

  it('runs the factory separately for different keys', async () => {
    const dedupe = createAsyncDedupe<string>();
    let calls = 0;
    const factory = (v: string) => () => {
      calls++;
      return Promise.resolve(v);
    };
    expect(await dedupe('a', factory('a'))).toBe('a');
    expect(await dedupe('b', factory('b'))).toBe('b');
    expect(calls).toBe(2);
  });

  it('returns the cached promise for a repeated key after it resolves', async () => {
    const dedupe = createAsyncDedupe<number>();
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.resolve(7);
    };
    await dedupe('k', factory);
    await dedupe('k', factory);
    expect(calls).toBe(1);
  });

  it('does not re-run a rejected factory within the same invocation', async () => {
    const dedupe = createAsyncDedupe<number>();
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.reject(new Error('upstream down'));
    };
    await expect(dedupe('k', factory)).rejects.toThrow('upstream down');
    await expect(dedupe('k', factory)).rejects.toThrow('upstream down');
    expect(calls).toBe(1);
  });
});
