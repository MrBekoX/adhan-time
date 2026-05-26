// Pure handler for the register-device edge function.
// Deno entry (index.ts) wires real Supabase client + env; jest tests inject fakes.

import { verifyBodyHmac } from '../_shared/hmac.ts';
import {
  checkRateLimit,
  ipHash,
  type RateLimitClient,
} from '../_shared/rate-limit.ts';
import { validateRegisterPayload, type ValidPayload } from '../_shared/validators.ts';

export type UpsertResult = { id: string } | { error: string };

export type RegisterDeps = {
  rateLimit: RateLimitClient;
  upsertDevice: (payload: ValidPayload) => Promise<UpsertResult>;
  /** When set, requests must carry a matching `x-body-signature` HMAC. */
  hmacSecret: string | null;
  now: () => Date;
};

const corsHeaders: Record<string, string> = {
  // Mobile clients ignore CORS; widening to '*' only helps malicious browsers.
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-body-signature, apikey',
  Vary: 'Origin',
};
const jsonHeaders: Record<string, string> = {
  ...corsHeaders,
  'Content-Type': 'application/json',
};

export async function handleRegisterDevice(
  req: Request,
  deps: RegisterDeps,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const raw = await req.text();
  if (!deps.hmacSecret) {
    return jsonError('hmac_secret_not_configured', 503);
  }

  const sig = req.headers.get('x-body-signature');
  const ok = await verifyBodyHmac(raw, sig, deps.hmacSecret);
  if (!ok) return jsonError('invalid_signature', 401);

  const ip = await ipHash(req);
  const allowed = await checkRateLimit(deps.rateLimit, ip, deps.now());
  if (!allowed) {
    return jsonError('rate_limited', 429);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError('invalid_body', 400);
  }

  const v = validateRegisterPayload(body);
  if (!v.ok) return jsonError(v.code, 400);

  const result = await deps.upsertDevice(v.data);
  if ('error' in result) {
    return jsonError('db_error', 500);
  }
  return new Response(JSON.stringify({ id: result.id }), {
    status: 200,
    headers: jsonHeaders,
  });
}

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), { status, headers: jsonHeaders });
}
