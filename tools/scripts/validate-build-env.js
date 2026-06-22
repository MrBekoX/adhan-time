const fs = require('fs');
const path = require('path');

const REQUIRED_PUBLIC_BUILD_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_REGISTER_HMAC_KEY',
];

const PLACEHOLDER_VALUES = {
  EXPO_PUBLIC_SUPABASE_URL: new Set(['https://your-project.supabase.co']),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: new Set(['sb_publishable_xxx']),
  EXPO_PUBLIC_REGISTER_HMAC_KEY: new Set(['set-in-production']),
};

const GOOGLE_SERVICES_FILE = 'google-services.json';

function parseDotEnv(contents) {
  const parsed = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function readDotEnvFiles(cwd) {
  const merged = {};
  for (const name of ['.env', '.env.local']) {
    const fullPath = path.join(cwd, name);
    if (!fs.existsSync(fullPath)) continue;
    Object.assign(merged, parseDotEnv(fs.readFileSync(fullPath, 'utf8')));
  }
  return merged;
}

function envValue(key, env, fileEnv) {
  const value = env[key] ?? fileEnv[key];
  return typeof value === 'string' ? value.trim() : '';
}

function validateBuildEnv({ env = process.env, fileEnv = {}, platform = null, cwd = null } = {}) {
  const missing = REQUIRED_PUBLIC_BUILD_KEYS.filter((key) => envValue(key, env, fileEnv) === '');
  const invalid = REQUIRED_PUBLIC_BUILD_KEYS.filter((key) => {
    const value = envValue(key, env, fileEnv);
    return value !== '' && PLACEHOLDER_VALUES[key]?.has(value);
  });

  // Android push tokens require FCM v1 — app.json references google-services.json
  // via android.googleServicesFile, so prebuild fails loudly if it is missing.
  // EAS sets EAS_BUILD_PLATFORM=android for Android builds; we also accept an
  // explicit caller-provided platform for tests + the local validate command.
  const resolvedPlatform = platform ?? env.EAS_BUILD_PLATFORM ?? null;
  const missingAndroidFcm =
    cwd && resolvedPlatform === 'android'
      ? !fs.existsSync(path.join(cwd, GOOGLE_SERVICES_FILE))
      : false;

  return {
    ok: missing.length === 0 && invalid.length === 0 && !missingAndroidFcm,
    missing,
    invalid,
    missingAndroidFcm,
  };
}

function main() {
  const cwd = process.cwd();
  const fileEnv = readDotEnvFiles(cwd);
  const result = validateBuildEnv({ env: process.env, fileEnv, cwd });
  if (result.ok) return;

  const lines = ['Build environment validation failed:'];
  for (const key of result.missing) lines.push(`- missing ${key}`);
  for (const key of result.invalid) lines.push(`- ${key} contains the example placeholder`);
  if (result.missingAndroidFcm) {
    lines.push(
      `- missing ${GOOGLE_SERVICES_FILE} at repo root (Android push tokens require FCM v1).`,
      '  Firebase Console > Project Settings > General > "google-services.json" and place it at',
      `  ${path.join(cwd, GOOGLE_SERVICES_FILE)}. See README §FCM for the full setup.`,
    );
  }
  if (result.missing.length > 0 || result.invalid.length > 0) {
    lines.push(
      '',
      'The installed APK must sign register/unregister device requests. Set',
      'EXPO_PUBLIC_REGISTER_HMAC_KEY to the same value as the Edge Function',
      'REGISTER_HMAC_KEY before running an EAS build. This key is client-bundled',
      'abuse friction, not a user-authentication secret.',
    );
  }

  console.error(lines.join('\n'));
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  parseDotEnv,
  validateBuildEnv,
};
