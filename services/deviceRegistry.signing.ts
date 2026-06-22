import { sha256 } from 'js-sha256';

/**
 * HMAC-SHA256 over a raw edge-function JSON body.
 * The key is bundled into the client, so this is abuse friction rather than
 * a user-authentication secret.
 */
export function signRegisterBody(body: string, secret: string | null | undefined): string | null {
  if (!secret) return null;
  return sha256.hmac(secret, body);
}
