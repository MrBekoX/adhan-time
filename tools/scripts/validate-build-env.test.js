const {
  parseDotEnv,
  validateBuildEnv,
} = require('./validate-build-env');

describe('validate-build-env', () => {
  it('fails APK-capable builds when register HMAC is missing', () => {
    const result = validateBuildEnv({
      env: {
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_123',
      },
      fileEnv: {},
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toContain('EXPO_PUBLIC_REGISTER_HMAC_KEY');
  });

  it('accepts the required public build environment', () => {
    const result = validateBuildEnv({
      env: {
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_123',
        EXPO_PUBLIC_REGISTER_HMAC_KEY: 'same-value-as-supabase-register-hmac',
      },
      fileEnv: {},
    });

    expect(result).toEqual({ ok: true, missing: [], invalid: [], missingAndroidFcm: false });
  });

  it('can read values from a local dotenv file for local EAS builds', () => {
    const fileEnv = parseDotEnv(`
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_123
EXPO_PUBLIC_REGISTER_HMAC_KEY=same-value-as-supabase-register-hmac
`);

    const result = validateBuildEnv({ env: {}, fileEnv });

    expect(result.ok).toBe(true);
  });

  it('rejects documented placeholder values', () => {
    const result = validateBuildEnv({
      env: {
        EXPO_PUBLIC_SUPABASE_URL: 'https://your-project.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_xxx',
        EXPO_PUBLIC_REGISTER_HMAC_KEY: 'set-in-production',
      },
      fileEnv: {},
    });

    expect(result.ok).toBe(false);
    expect(result.invalid).toEqual([
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_REGISTER_HMAC_KEY',
    ]);
  });

  describe('Android FCM v1 file requirement', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-build-env-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const VALID_ENV = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_123',
      EXPO_PUBLIC_REGISTER_HMAC_KEY: 'shared-secret',
    };

    it('fails Android builds when google-services.json is missing from repo root', () => {
      const result = validateBuildEnv({
        env: VALID_ENV,
        fileEnv: {},
        platform: 'android',
        cwd: tmpDir,
      });

      expect(result.ok).toBe(false);
      expect(result.missingAndroidFcm).toBe(true);
    });

    it('passes Android builds when google-services.json is present', () => {
      fs.writeFileSync(path.join(tmpDir, 'google-services.json'), '{}');

      const result = validateBuildEnv({
        env: VALID_ENV,
        fileEnv: {},
        platform: 'android',
        cwd: tmpDir,
      });

      expect(result).toEqual({
        ok: true,
        missing: [],
        invalid: [],
        missingAndroidFcm: false,
      });
    });

    it('does not require google-services.json for iOS builds', () => {
      const result = validateBuildEnv({
        env: VALID_ENV,
        fileEnv: {},
        platform: 'ios',
        cwd: tmpDir,
      });

      expect(result.ok).toBe(true);
      expect(result.missingAndroidFcm).toBe(false);
    });

    it('honors EAS_BUILD_PLATFORM=android from EAS Build env', () => {
      const result = validateBuildEnv({
        env: { ...VALID_ENV, EAS_BUILD_PLATFORM: 'android' },
        fileEnv: {},
        cwd: tmpDir,
      });

      expect(result.ok).toBe(false);
      expect(result.missingAndroidFcm).toBe(true);
    });
  });
});
