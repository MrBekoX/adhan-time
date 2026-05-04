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
  const ip =
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
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
}): RateLimitClient {
  return {
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
