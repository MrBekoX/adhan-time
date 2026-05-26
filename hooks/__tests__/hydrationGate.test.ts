import { evaluateHydrationGate, forceHydrationFlags } from '../hydrationGate';

describe('evaluateHydrationGate (F10)', () => {
  const TIMEOUT = 5000;

  it('returns not-ready while at least one flag is false and timeout not reached', () => {
    expect(
      evaluateHydrationGate({ flags: [false, false, false], elapsedMs: 0, timeoutMs: TIMEOUT }),
    ).toEqual({ ready: false, timedOut: false });

    expect(
      evaluateHydrationGate({ flags: [true, false, false], elapsedMs: 1000, timeoutMs: TIMEOUT }),
    ).toEqual({ ready: false, timedOut: false });

    expect(
      evaluateHydrationGate({ flags: [true, true, false], elapsedMs: 4999, timeoutMs: TIMEOUT }),
    ).toEqual({ ready: false, timedOut: false });
  });

  it('returns ready (no timeout) once every flag is true', () => {
    expect(
      evaluateHydrationGate({ flags: [true, true, true], elapsedMs: 0, timeoutMs: TIMEOUT }),
    ).toEqual({ ready: true, timedOut: false });

    // Even if timeout has elapsed, all-hydrated path wins (no timeout signal).
    expect(
      evaluateHydrationGate({ flags: [true, true, true], elapsedMs: 9999, timeoutMs: TIMEOUT }),
    ).toEqual({ ready: true, timedOut: false });
  });

  it('forces ready and flags timedOut when elapsedMs >= timeoutMs and stores are still hydrating', () => {
    expect(
      evaluateHydrationGate({ flags: [false, false, false], elapsedMs: 5000, timeoutMs: TIMEOUT }),
    ).toEqual({ ready: true, timedOut: true });

    expect(
      evaluateHydrationGate({ flags: [true, false, true], elapsedMs: 6000, timeoutMs: TIMEOUT }),
    ).toEqual({ ready: true, timedOut: true });
  });

  it('treats an empty flags array as ready (no stores to wait on)', () => {
    expect(
      evaluateHydrationGate({ flags: [], elapsedMs: 0, timeoutMs: TIMEOUT }),
    ).toEqual({ ready: true, timedOut: false });
  });

  it('forces every store hydrated flag when the timeout path fires', () => {
    const setters = [jest.fn(), jest.fn(), jest.fn()];
    forceHydrationFlags(setters);
    for (const setHydrated of setters) {
      expect(setHydrated).toHaveBeenCalledWith(true);
    }
  });
});
