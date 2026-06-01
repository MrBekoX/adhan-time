// Coalesces async calls by key within a single process invocation: the factory
// runs once per key; concurrent or repeated callers await the same promise.
//
// push-prayer uses this so the upstream yearly-prayer fetch runs at most once
// per (district_id, year) per cron run — regardless of how many stale devices
// share a district, and resiliently even if the device loop is later
// parallelized (Promise.all). Without it, N devices in the same district could
// each miss the cache and hammer the ezanvakti API in the same tick.
//
// Scope is one invocation only (the map is GC'd when the handler returns); it is
// NOT a cross-invocation lock. A rejected factory stays cached for the run so a
// failing upstream isn't retried N times within the same tick.
export function createAsyncDedupe<T>(): (key: string, factory: () => Promise<T>) => Promise<T> {
  const inflight = new Map<string, Promise<T>>();
  return (key, factory) => {
    const existing = inflight.get(key);
    if (existing) return existing;
    const started = factory();
    inflight.set(key, started);
    return started;
  };
}
