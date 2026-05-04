import { verifyCronSecret } from './cron-auth';

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://x', { method: 'POST', headers });
}

describe('verifyCronSecret', () => {
  it('accepts a request whose x-cron-secret matches', () => {
    expect(verifyCronSecret(reqWith({ 'x-cron-secret': 'abc123' }), 'abc123')).toBe(true);
  });

  it('rejects a request with no header', () => {
    expect(verifyCronSecret(reqWith({}), 'abc123')).toBe(false);
  });

  it('rejects a request with the wrong secret', () => {
    expect(verifyCronSecret(reqWith({ 'x-cron-secret': 'wrong' }), 'abc123')).toBe(false);
  });

  it('rejects when the configured secret is null/empty (fail closed)', () => {
    expect(verifyCronSecret(reqWith({ 'x-cron-secret': 'abc123' }), null)).toBe(false);
    expect(verifyCronSecret(reqWith({ 'x-cron-secret': 'abc123' }), '')).toBe(false);
    expect(verifyCronSecret(reqWith({ 'x-cron-secret': 'abc123' }), undefined)).toBe(false);
  });

  it('rejects when the secret length differs (no partial match)', () => {
    expect(verifyCronSecret(reqWith({ 'x-cron-secret': 'abc' }), 'abc123')).toBe(false);
    expect(verifyCronSecret(reqWith({ 'x-cron-secret': 'abc1234' }), 'abc123')).toBe(false);
  });
});
