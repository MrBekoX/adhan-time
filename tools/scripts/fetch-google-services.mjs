#!/usr/bin/env node
// Generate android google-services.json from a Firebase service-account key,
// using the Firebase Management API — no manual Firebase Console clicking.
//
// What it does (idempotent):
//   1. Mints a Google OAuth access token from the service-account private key.
//   2. Lists the project's Android apps; finds the one for ANDROID_PACKAGE.
//   3. If none exists, CREATES one (logged) and waits for the operation.
//   4. Fetches that app's config and writes ./google-services.json.
//
// Usage:
//   node tools/scripts/fetch-google-services.mjs <path-to-service-account.json>
// Env overrides: ANDROID_PACKAGE (default com.adhantime.app)

import crypto from 'node:crypto';
import fs from 'node:fs';

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('Usage: node tools/scripts/fetch-google-services.mjs <service-account.json>');
  process.exit(2);
}
const PACKAGE = process.env.ANDROID_PACKAGE ?? 'com.adhantime.app';
const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const PROJECT = sa.project_id;
const BASE = 'https://firebase.googleapis.com/v1beta1';
const log = (m) => console.log(`[fetch-google-services] ${m}`);

const b64url = (s) => Buffer.from(s).toString('base64url');

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key, 'base64url');
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`token exchange failed (${res.status}): ${JSON.stringify(j)}`);
  return j.access_token;
}

async function api(token, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const j = text ? JSON.parse(text) : {};
  if (j.error) throw new Error(`${url}\n -> ${JSON.stringify(j.error)}`);
  return j;
}

const token = await getAccessToken();
log(`Authenticated for project ${PROJECT}.`);

// 1. find the Android app for PACKAGE
let apps = [];
let pageToken;
do {
  const u = new URL(`${BASE}/projects/${PROJECT}/androidApps`);
  u.searchParams.set('pageSize', '100');
  if (pageToken) u.searchParams.set('pageToken', pageToken);
  const j = await api(token, u.toString());
  apps = apps.concat(j.apps ?? []);
  pageToken = j.nextPageToken;
} while (pageToken);

let app = apps.find((a) => a.packageName === PACKAGE);
if (app) {
  log(`Found existing Android app: ${app.appId} (${app.packageName})`);
} else {
  log(`No Android app for ${PACKAGE} — creating one…`);
  const op = await api(token, `${BASE}/projects/${PROJECT}/androidApps`, {
    method: 'POST',
    body: JSON.stringify({ packageName: PACKAGE, displayName: 'Adhan Time' }),
  });
  let done = op.done ? op : null;
  while (!done) {
    await new Promise((s) => setTimeout(s, 2000));
    const poll = await api(token, `${BASE}/${op.name}`);
    if (poll.done) done = poll;
  }
  if (done.error) throw new Error(`create failed: ${JSON.stringify(done.error)}`);
  app = done.response;
  log(`Created Android app: ${app.appId}`);
}

// 2. fetch its config and write google-services.json
const cfg = await api(token, `${BASE}/projects/${PROJECT}/androidApps/${app.appId}/config`);
const contents = Buffer.from(cfg.configFileContents, 'base64').toString('utf8');
fs.writeFileSync('google-services.json', contents);
log(`Wrote google-services.json (${cfg.configFilename}) for ${app.packageName}.`);
log('Next: add "googleServicesFile": "./google-services.json" to app.json android block, then rebuild.');
