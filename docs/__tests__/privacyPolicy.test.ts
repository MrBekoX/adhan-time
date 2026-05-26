import fs from 'fs';
import path from 'path';

const POLICY_PATH = path.resolve(__dirname, '../privacy-policy.md');

describe('privacy policy (S5)', () => {
  it('documents KVKK and GDPR user rights for store review', () => {
    expect(fs.existsSync(POLICY_PATH)).toBe(true);
    const text = fs.readFileSync(POLICY_PATH, 'utf8');
    expect(text).toContain('KVKK Madde 11');
    expect(text).toContain('GDPR Article 13');
    expect(text).toContain('expo_push_token');
    expect(text).toContain('180');
    expect(text).toContain('Verilerimi sil');
  });
});
