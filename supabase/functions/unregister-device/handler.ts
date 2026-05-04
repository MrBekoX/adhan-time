// S4: device-driven account deletion (KVKK/GDPR).
// The mobile client sends its own push token; the edge function deletes the
// matching row in `devices`. No HMAC: an attacker could only "annoy" a user
// by removing their server fallback, and the next app open re-registers
// automatically.

const TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_-]{20,40}\]$/;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  Vary: 'Origin',
};
const jsonHeaders: Record<string, string> = {
  ...corsHeaders,
  'Content-Type': 'application/json',
};

export type UnregisterDeps = {
  deleteByToken: (token: string) => Promise<void>;
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

  try {
    await deps.deleteByToken(token);
  } catch {
    return jsonError('db_error', 500);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
}

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), { status, headers: jsonHeaders });
}
