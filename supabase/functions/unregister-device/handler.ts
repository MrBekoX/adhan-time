// Device-driven account deletion (KVKK/GDPR). The mobile client sends its
// own push token plus its stable per-install deviceId; this edge function
// deletes only the row matching both values.

import { verifyBodyHmac } from '../_shared/hmac.ts';
import {
  checkRateLimit,
  ipHash,
  type RateLimitClient,
} from '../_shared/rate-limit.ts';

const TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_-]{20,40}\]$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-body-signature, apikey',
  Vary: 'Origin',
};
const jsonHeaders: Record<string, string> = {
  ...corsHeaders,
  'Content-Type': 'application/json',
};

export type UnregisterDeps = {
  rateLimit: RateLimitClient;
  deleteByTokenAndDeviceId: (token: string, deviceId: string) => Promise<void>;
  /** Client-bundled proof key. This is abuse friction, not a real user secret. */
  hmacSecret: string | null;
  now: () => Date;
};

export async function handleUnregisterDevice(
  req: Request,
  deps: UnregisterDeps,
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

  const token =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).expoPushToken
      : undefined;
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
    return jsonError('invalid_token', 400);
  }
  const deviceId =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).deviceId
      : undefined;
  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    return jsonError('invalid_device_id', 400);
  }

  try {
    await deps.deleteByTokenAndDeviceId(token, deviceId);
  } catch {
    return jsonError('db_error', 500);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
}

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), { status, headers: jsonHeaders });
}
