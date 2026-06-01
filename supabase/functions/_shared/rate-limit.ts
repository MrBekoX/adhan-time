// IP-bucket rate limiter that runs against a generic key/value store.
// The Deno entry wires it to Supabase via createSupabaseRateLimitClient();
// jest tests inject an in-memory FakeClient.

export type RateLimitRow = {
  ip_hash: string;
  request_count: number;
  window_start: string; // ISO timestamp
};

export type RateLimitClient = {
  read: (ipHash: string) => Promise<RateLimitRow | null>;
  insert: (row: RateLimitRow) => Promise<void>;
  increment: (ipHash: string, newCount: number) => Promise<void>;
  // Atomic path: a single DB call that resets/increments the window and returns
  // whether the request is allowed. When present, checkRateLimit prefers it over
  // the read→decide→increment fallback to avoid a TOCTOU race under bursts.
  consume?: (
    ipHash: string,
    windowMs: number,
    maxRequests: number,
    now: Date,
  ) => Promise<boolean>;
};

export type RateLimitOptions = {
  windowMs?: number;
  maxRequests?: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;

export async function checkRateLimit(
  client: RateLimitClient,
  ipHashStr: string,
  now: Date,
  options: RateLimitOptions = {},
): Promise<boolean> {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;

  // Prefer the atomic DB function when the client supports it (production).
  if (client.consume) {
    return client.consume(ipHashStr, windowMs, maxRequests, now);
  }

  // Fallback (e.g. test fakes): non-atomic read→decide→increment.
  const row = await client.read(ipHashStr);
  if (!row || now.getTime() - new Date(row.window_start).getTime() > windowMs) {
    await client.insert({
      ip_hash: ipHashStr,
      request_count: 1,
      window_start: now.toISOString(),
    });
    return true;
  }
  if (row.request_count >= maxRequests) return false;
  await client.increment(ipHashStr, row.request_count + 1);
  return true;
}

export async function ipHash(req: Request): Promise<string> {
  // Prefer x-forwarded-for: Supabase's edge populates it with the client IP and
  // its documented convention is to read the leftmost entry. x-real-ip /
  // cf-connecting-ip are client-settable and NOT populated by Supabase, so
  // trusting them first was the worse spoof vector. Caveat: leftmost-XFF is only
  // trustworthy because the gateway populates it — a generic XFF is client
  // appendable. This is best-effort abuse resistance, layered behind HMAC + RLS,
  // not a hard identity.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';
  const buf = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

// Deno-only factory: wraps a Supabase client into the abstract RateLimitClient
// interface used by checkRateLimit. Kept here so handler.ts can stay
// platform-neutral.
export function createSupabaseRateLimitClient(supabase: {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> };
    };
    upsert: (row: unknown) => Promise<{ error: unknown }>;
    update: (row: unknown) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}): RateLimitClient {
  return {
    // Atomic primary path — the rl_consume() Postgres function.
    async consume(ipHashStr, windowMs, maxRequests) {
      const { data, error } = await supabase.rpc('rl_consume', {
        p_ip_hash: ipHashStr,
        p_window_ms: windowMs,
        p_max: maxRequests,
      });
      if (error) throw error;
      return data === true;
    },
    // read/insert/increment retained for completeness + any non-RPC fallback.
    async read(ipHashStr) {
      const { data } = await supabase
        .from('rl_buckets')
        .select('*')
        .eq('ip_hash', ipHashStr)
        .maybeSingle();
      return (data as RateLimitRow | null) ?? null;
    },
    async insert(row) {
      await supabase.from('rl_buckets').upsert(row);
    },
    async increment(ipHashStr, newCount) {
      await supabase
        .from('rl_buckets')
        .update({ request_count: newCount })
        .eq('ip_hash', ipHashStr);
    },
  };
}
