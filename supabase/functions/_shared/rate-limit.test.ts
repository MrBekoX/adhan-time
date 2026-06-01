import { checkRateLimit, ipHash, type RateLimitClient, type RateLimitRow } from './rate-limit';

class FakeClient implements RateLimitClient {
  rows = new Map<string, RateLimitRow>();
  inserts = 0;
  updates = 0;

  async read(ip: string): Promise<RateLimitRow | null> {
    return this.rows.get(ip) ?? null;
  }
  async insert(row: RateLimitRow): Promise<void> {
    this.inserts++;
    this.rows.set(row.ip_hash, row);
  }
  async increment(ip: string, count: number): Promise<void> {
    this.updates++;
    const row = this.rows.get(ip);
    if (!row) return;
    this.rows.set(ip, { ...row, request_count: count });
  }
}

describe('checkRateLimit', () => {
  it('allows the first request and stores a row', async () => {
    const c = new FakeClient();
    const now = new Date('2026-05-04T10:00:00Z');
    expect(await checkRateLimit(c, 'h1', now)).toBe(true);
    expect(c.rows.get('h1')?.request_count).toBe(1);
    expect(c.inserts).toBe(1);
  });

  it('allows up to 10 requests within the window', async () => {
    const c = new FakeClient();
    const now = new Date('2026-05-04T10:00:00Z');
    for (let i = 0; i < 10; i++) {
      expect(await checkRateLimit(c, 'h1', now)).toBe(true);
    }
    expect(c.rows.get('h1')?.request_count).toBe(10);
  });

  it('blocks the 11th request within the window', async () => {
    const c = new FakeClient();
    const now = new Date('2026-05-04T10:00:00Z');
    for (let i = 0; i < 10; i++) await checkRateLimit(c, 'h1', now);
    expect(await checkRateLimit(c, 'h1', now)).toBe(false);
  });

  it('resets after the 60s window elapses', async () => {
    const c = new FakeClient();
    const t0 = new Date('2026-05-04T10:00:00Z');
    for (let i = 0; i < 10; i++) await checkRateLimit(c, 'h1', t0);
    expect(await checkRateLimit(c, 'h1', t0)).toBe(false);
    const t1 = new Date(t0.getTime() + 61_000);
    expect(await checkRateLimit(c, 'h1', t1)).toBe(true);
    expect(c.rows.get('h1')?.request_count).toBe(1);
  });

  it('tracks separate ip_hash buckets independently', async () => {
    const c = new FakeClient();
    const now = new Date('2026-05-04T10:00:00Z');
    for (let i = 0; i < 10; i++) await checkRateLimit(c, 'h1', now);
    expect(await checkRateLimit(c, 'h2', now)).toBe(true);
  });

  it('respects a custom maxRequests option', async () => {
    const c = new FakeClient();
    const now = new Date('2026-05-04T10:00:00Z');
    expect(await checkRateLimit(c, 'h1', now, { maxRequests: 2 })).toBe(true);
    expect(await checkRateLimit(c, 'h1', now, { maxRequests: 2 })).toBe(true);
    expect(await checkRateLimit(c, 'h1', now, { maxRequests: 2 })).toBe(false);
  });
});

// Mirrors the rl_consume() Postgres function: a single atomic call that resets
// the window / increments and returns whether the request is allowed.
class FakeAtomicClient implements RateLimitClient {
  rows = new Map<string, RateLimitRow>();
  consumeCalls = 0;
  reads = 0;
  inserts = 0;
  updates = 0;

  async read(ip: string): Promise<RateLimitRow | null> {
    this.reads++;
    return this.rows.get(ip) ?? null;
  }
  async insert(row: RateLimitRow): Promise<void> {
    this.inserts++;
    this.rows.set(row.ip_hash, row);
  }
  async increment(ip: string, count: number): Promise<void> {
    this.updates++;
    const row = this.rows.get(ip);
    if (row) this.rows.set(ip, { ...row, request_count: count });
  }
  async consume(ip: string, windowMs: number, max: number, now: Date): Promise<boolean> {
    this.consumeCalls++;
    const row = this.rows.get(ip);
    const expired = !row || now.getTime() - new Date(row.window_start).getTime() > windowMs;
    const nextCount = expired ? 1 : row!.request_count + 1;
    this.rows.set(ip, {
      ip_hash: ip,
      request_count: nextCount,
      window_start: expired ? now.toISOString() : row!.window_start,
    });
    return nextCount <= max;
  }
}

describe('checkRateLimit — atomic consume path', () => {
  it('prefers client.consume and never touches read/insert/increment', async () => {
    const c = new FakeAtomicClient();
    const now = new Date('2026-05-04T10:00:00Z');
    expect(await checkRateLimit(c, 'h1', now)).toBe(true);
    expect(c.consumeCalls).toBe(1);
    expect(c.reads).toBe(0);
    expect(c.inserts).toBe(0);
    expect(c.updates).toBe(0);
  });

  it('enforces the limit through the atomic path (10 allowed, 11th denied)', async () => {
    const c = new FakeAtomicClient();
    const now = new Date('2026-05-04T10:00:00Z');
    for (let i = 0; i < 10; i++) expect(await checkRateLimit(c, 'h1', now)).toBe(true);
    expect(await checkRateLimit(c, 'h1', now)).toBe(false);
    expect(c.consumeCalls).toBe(11);
  });

  it('resets after the window via the atomic path', async () => {
    const c = new FakeAtomicClient();
    const t0 = new Date('2026-05-04T10:00:00Z');
    for (let i = 0; i < 10; i++) await checkRateLimit(c, 'h1', t0);
    expect(await checkRateLimit(c, 'h1', t0)).toBe(false);
    const t1 = new Date(t0.getTime() + 61_000);
    expect(await checkRateLimit(c, 'h1', t1)).toBe(true);
  });
});

describe('ipHash', () => {
  it('hashes x-real-ip into 32-char hex', async () => {
    const r = new Request('http://x', { headers: { 'x-real-ip': '1.2.3.4' } });
    expect(await ipHash(r)).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces the same hash for the same IP across header sources', async () => {
    const a = new Request('http://x', { headers: { 'x-real-ip': '1.2.3.4' } });
    const b = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(await ipHash(a)).toBe(await ipHash(b));
  });

  it('returns a stable hash when no IP header is present', async () => {
    const r = new Request('http://x');
    const a = await ipHash(r);
    const b = await ipHash(new Request('http://x'));
    expect(a).toBe(b);
  });

  it('produces different hashes for different IPs', async () => {
    const a = new Request('http://x', { headers: { 'x-real-ip': '1.2.3.4' } });
    const b = new Request('http://x', { headers: { 'x-real-ip': '5.6.7.8' } });
    expect(await ipHash(a)).not.toBe(await ipHash(b));
  });

  it('prefers gateway x-forwarded-for over client-settable x-real-ip', async () => {
    // A client spoofing x-real-ip cannot change its bucket: the gateway-set
    // x-forwarded-for first entry wins.
    const spoofed = new Request('http://x', {
      headers: { 'x-forwarded-for': '9.9.9.9', 'x-real-ip': '1.1.1.1' },
    });
    const real = new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9' } });
    expect(await ipHash(spoofed)).toBe(await ipHash(real));
  });
});
