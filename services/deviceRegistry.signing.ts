import { sha256 } from 'js-sha256';

/**
 * HMAC-SHA256 over the raw register-device JSON body.
 * Returns hex; null when the secret is empty so the caller can decide whether
 * to attach the `x-body-signature` header.
 */
export function signRegisterBody(body: string, secret: string | null | undefined): string | null {
  if (!secret) return null;
  return sha256.hmac(secret, body);
}
