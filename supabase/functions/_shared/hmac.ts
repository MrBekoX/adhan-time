// SHA-256 HMAC over a request body, hex encoded.
// Uses Web Crypto subtle (available in Deno + Node 18+) so the same code
// runs in the edge function runtime and in jest.

const encoder = new TextEncoder();

export async function computeBodyHmac(body: string, secret: string): Promise<string> {
  if (!secret) throw new Error('hmac-secret-empty');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyBodyHmac(
  body: string,
  providedHex: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!providedHex || !secret) return false;
  let expected: string;
  try {
    expected = await computeBodyHmac(body, secret);
  } catch {
    return false;
  }
  if (expected.length !== providedHex.length) return false;
  // constant-time compare to avoid leaking timing info
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ providedHex.charCodeAt(i);
  }
  return mismatch === 0;
}
