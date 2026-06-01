#!/usr/bin/env node
// Dependency-free secret scanner. Runs in the pre-commit hook (staged files)
// and in CI / `npm run secrets:scan` (--all = every tracked file). High-signal,
// low-false-positive patterns only, so it never blocks a legitimate commit.
//
// Why hand-rolled instead of gitleaks: gitleaks is not a project dependency and
// requires a platform binary the dev/CI may not have. This covers the concrete
// threats this repo faces (Firebase admin key, private keys, Supabase secret
// keys, credential files) with zero install.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const scanAll = process.argv.includes('--all');

// Files we never scan for content (known-safe placeholders / generated).
const ALLOWLIST = new Set([
  '.env.example',
  'tools/scripts/scan-secrets.mjs',
  'package-lock.json',
]);

// Secret CONTENT signatures (intentionally narrow).
const CONTENT_RULES = [
  { name: 'private key block', re: /-----BEGIN (?:ENCRYPTED |RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'GCP/Firebase service-account JSON', re: /"type"\s*:\s*"service_account"/ },
  { name: 'Supabase secret (service_role) key', re: /\bsb_secret_[A-Za-z0-9_-]{8,}/ },
  { name: 'legacy service_role JWT claim', re: /"role"\s*:\s*"service_role"/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
];

// FILENAMES that must never be committed (belt-and-suspenders over .gitignore).
const FILENAME_RULES = [
  { name: 'Firebase admin SDK key', re: /firebase-adminsdk/i },
  { name: 'Google services config', re: /^google-services\.json$/ },
  { name: 'raw .env file', re: /^\.env(\.[A-Za-z0-9_-]+)?$/, allow: /^\.env\.example$/ },
  { name: 'signing/cert material', re: /\.(p8|p12|jks|key|pem|mobileprovision)$/i },
];

function listFiles() {
  // Static argument arrays via execFileSync — no shell, no injection surface.
  const args = scanAll
    ? ['ls-files']
    : ['diff', '--cached', '--name-only', '--diff-filter=ACM'];
  const out = execFileSync('git', args, { encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function looksBinary(buf) {
  // NUL byte in the first 8 KiB → treat as binary, skip content scan.
  const slice = buf.subarray(0, 8192);
  return slice.includes(0);
}

const findings = [];

for (const file of listFiles()) {
  const base = path.basename(file);

  for (const rule of FILENAME_RULES) {
    if (rule.allow && rule.allow.test(base)) continue;
    if (rule.re.test(base)) {
      findings.push({ file, kind: `filename: ${rule.name}` });
    }
  }

  if (ALLOWLIST.has(file)) continue;
  if (!existsSync(file)) continue;
  try {
    if (statSync(file).size > 2 * 1024 * 1024) continue;
  } catch {
    continue;
  }

  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue;
  }
  if (looksBinary(buf)) continue;
  const text = buf.toString('utf8');
  for (const rule of CONTENT_RULES) {
    if (rule.re.test(text)) {
      findings.push({ file, kind: `content: ${rule.name}` });
    }
  }
}

if (findings.length > 0) {
  const where = scanAll ? 'tracked files' : 'staged changes';
  console.error(`\n✖ secret scan: potential secret(s) in ${where}:\n`);
  for (const f of findings) {
    console.error(`  • ${f.file}  (${f.kind})`);
  }
  console.error(
    '\nRemove the secret, add it to .gitignore, and rotate it if it was ever pushed.\n' +
      'If this is a false positive, add the path to ALLOWLIST in tools/scripts/scan-secrets.mjs.\n',
  );
  process.exit(1);
}

console.log(`✓ secret scan clean (${scanAll ? 'all tracked files' : 'staged changes'}).`);
