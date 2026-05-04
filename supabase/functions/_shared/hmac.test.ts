import { computeBodyHmac, verifyBodyHmac } from './hmac';

describe('computeBodyHmac', () => {
  it('returns a stable 64-char hex SHA-256 HMAC', async () => {
    const sig = await computeBodyHmac('{"a":1}', 'topsecret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    const sig2 = await computeBodyHmac('{"a":1}', 'topsecret');
    expect(sig).toBe(sig2);
  });

  it('produces different signatures for different bodies', async () => {
    const a = await computeBodyHmac('{"a":1}', 'k');
    const b = await computeBodyHmac('{"a":2}', 'k');
    expect(a).not.toBe(b);
  });

  it('produces different signatures for different secrets', async () => {
    const a = await computeBodyHmac('{"a":1}', 'k1');
    const b = await computeBodyHmac('{"a":1}', 'k2');
    expect(a).not.toBe(b);
  });

  it('throws when secret is empty', async () => {
    await expect(computeBodyHmac('{"a":1}', '')).rejects.toThrow();
  });
});

describe('verifyBodyHmac', () => {
  it('verifies a correct signature', async () => {
    const body = '{"hello":"world"}';
    const sig = await computeBodyHmac(body, 'shh');
    expect(await verifyBodyHmac(body, sig, 'shh')).toBe(true);
  });

  it('rejects an incorrect signature of the same length', async () => {
    expect(await verifyBodyHmac('{"a":1}', 'd'.repeat(64), 'shh')).toBe(false);
  });

  it('rejects a signature with the wrong length', async () => {
    expect(await verifyBodyHmac('{"a":1}', 'short', 'shh')).toBe(false);
  });

  it('rejects when signature is missing', async () => {
    expect(await verifyBodyHmac('{"a":1}', null, 'shh')).toBe(false);
    expect(await verifyBodyHmac('{"a":1}', undefined, 'shh')).toBe(false);
    expect(await verifyBodyHmac('{"a":1}', '', 'shh')).toBe(false);
  });

  it('rejects when secret is empty', async () => {
    expect(await verifyBodyHmac('{"a":1}', 'a'.repeat(64), '')).toBe(false);
  });

  it('rejects when body has been tampered with', async () => {
    const sig = await computeBodyHmac('{"a":1}', 's');
    expect(await verifyBodyHmac('{"a":2}', sig, 's')).toBe(false);
  });
});
