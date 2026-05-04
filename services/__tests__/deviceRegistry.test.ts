import { computeBodyHmac } from '../../supabase/functions/_shared/hmac';
import { signRegisterBody } from '../deviceRegistry.signing';

describe('signRegisterBody', () => {
  it('produces a 64-char hex HMAC-SHA256 of the JSON body', () => {
    const sig = signRegisterBody('{"a":1}', 'topsecret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('matches the edge-function verifier (computeBodyHmac)', async () => {
    const body = '{"hello":"world","n":42}';
    const secret = 'shared-key-2026';
    const mobile = signRegisterBody(body, secret);
    const edge = await computeBodyHmac(body, secret);
    expect(mobile).toBe(edge);
  });

  it('returns null when the secret is empty', () => {
    expect(signRegisterBody('{"a":1}', '')).toBeNull();
    expect(signRegisterBody('{"a":1}', undefined)).toBeNull();
  });
});
