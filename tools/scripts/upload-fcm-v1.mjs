#!/usr/bin/env node
// One-shot uploader: pushes a Firebase service account JSON to EAS as the
// project's FCM v1 push credential, bypassing eas-cli's interactive flow.
// Mirrors what `eas credentials --platform android` does internally:
//   1. createGoogleServiceAccountKey(jsonKey, accountId)
//   2. createOrGet AndroidAppCredentials for (appId, applicationIdentifier)
//   3. setGoogleServiceAccountKeyForFcmV1(credentialsId, gsaKeyId)
//
// Usage:
//   node tools/scripts/upload-fcm-v1.mjs <path-to-service-account.json>
//
// Auth comes from ~/.expo/state.json (the same place eas-cli reads it).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EAS_GRAPHQL = 'https://api.expo.dev/graphql';
const APP_ID = process.env.EAS_APP_ID ?? '0c7ed0e3-6aad-490f-b042-0616031622b9';
const APPLICATION_IDENTIFIER = process.env.ANDROID_APPLICATION_ID ?? 'com.adhantime.app';

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node upload-fcm-v1.mjs <path-to-service-account.json>');
  process.exit(2);
}

const statePath = path.join(os.homedir(), '.expo', 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const sessionSecret = state?.auth?.sessionSecret;
if (!sessionSecret) {
  console.error('No EAS session in ~/.expo/state.json — run `eas login` first.');
  process.exit(3);
}

const keyJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
for (const f of ['type', 'private_key', 'client_email', 'project_id', 'private_key_id', 'client_id']) {
  if (!keyJson[f]) {
    console.error(`Service account JSON missing required field: ${f}`);
    process.exit(4);
  }
}

async function gql(query, variables) {
  const resp = await fetch(EAS_GRAPHQL, {
    method: 'POST',
    headers: {
      'expo-session': sessionSecret,
      'Content-Type': 'application/json',
      'User-Agent': 'adhan-time-fcm-uploader/1.0',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`Non-JSON response (${resp.status}): ${text.slice(0, 200)}`); }
  if (body.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(body.errors, null, 2)}`);
  }
  if (!body.data) throw new Error(`Empty data in response: ${text.slice(0, 200)}`);
  return body.data;
}

const log = (msg) => console.log(`[upload-fcm-v1] ${msg}`);

// Step 1: viewer + accountId
log('Querying current user + account…');
const viewerData = await gql(`query { meActor { __typename ... on User { id username accounts { id name } } ... on Robot { id firstName accounts { id name } } } }`);
const actor = viewerData.meActor;
if (!actor) throw new Error('Could not resolve current EAS actor.');
const accountName = state?.auth?.username ?? null;
const account = actor.accounts.find((a) => a.name === accountName) ?? actor.accounts[0];
if (!account) throw new Error('No account found on EAS user.');
log(`Account: ${account.name} (id=${account.id})`);

// Step 2: list existing GSA keys for the account; reuse if one matches the JSON
log(`Looking for an existing GSA key with private_key_id=${keyJson.private_key_id}…`);
const listGsaQuery = `
  query($accountName: String!) {
    account {
      byName(accountName: $accountName) {
        id
        googleServiceAccountKeys {
          id clientEmail projectIdentifier privateKeyIdentifier clientIdentifier updatedAt
        }
      }
    }
  }
`;
const listData = await gql(listGsaQuery, { accountName: account.name });
const existingKeys = listData?.account?.byName?.googleServiceAccountKeys ?? [];
let gsaKey = existingKeys.find((k) => k.privateKeyIdentifier === keyJson.private_key_id);
if (gsaKey) {
  log(`Reusing existing GSA key: id=${gsaKey.id} client=${gsaKey.clientEmail}`);
} else {
  log(`Uploading new GSA key (client_email=${keyJson.client_email})…`);
  const createGsaQuery = `
    mutation($input: GoogleServiceAccountKeyInput!, $accountId: ID!) {
      googleServiceAccountKey {
        createGoogleServiceAccountKey(googleServiceAccountKeyInput: $input, accountId: $accountId) {
          id clientEmail projectIdentifier privateKeyIdentifier clientIdentifier updatedAt
        }
      }
    }
  `;
  const gsaData = await gql(createGsaQuery, {
    input: { jsonKey: keyJson },
    accountId: account.id,
  });
  gsaKey = gsaData.googleServiceAccountKey.createGoogleServiceAccountKey;
  log(`GSA key uploaded: id=${gsaKey.id} client=${gsaKey.clientEmail}`);
}

// Step 3: find or create AndroidAppCredentials for (appId, applicationIdentifier)
log(`Resolving AndroidAppCredentials for ${APPLICATION_IDENTIFIER}…`);
const findCredsQuery = `
  query($appId: String!, $applicationIdentifier: String!) {
    app {
      byId(appId: $appId) {
        androidAppCredentials(filter: { applicationIdentifier: $applicationIdentifier }) {
          id
          googleServiceAccountKeyForFcmV1 { id clientEmail }
        }
      }
    }
  }
`;
const findData = await gql(findCredsQuery, { appId: APP_ID, applicationIdentifier: APPLICATION_IDENTIFIER });
let credId = findData?.app?.byId?.androidAppCredentials?.[0]?.id ?? null;

if (!credId) {
  log('No existing AndroidAppCredentials — creating new entry…');
  const createCredsQuery = `
    mutation($input: AndroidAppCredentialsInput!, $appId: String!, $applicationIdentifier: String!) {
      androidAppCredentials {
        createAndroidAppCredentials(
          androidAppCredentialsInput: $input
          appId: $appId
          applicationIdentifier: $applicationIdentifier
        ) { id }
      }
    }
  `;
  const createCredsData = await gql(createCredsQuery, {
    input: {},
    appId: APP_ID,
    applicationIdentifier: APPLICATION_IDENTIFIER,
  });
  credId = createCredsData.androidAppCredentials.createAndroidAppCredentials.id;
  log(`Created AndroidAppCredentials: id=${credId}`);
} else {
  log(`Using existing AndroidAppCredentials: id=${credId}`);
}

// Step 4: assign GSA key for FCM v1
log('Assigning GSA key to AndroidAppCredentials for FCM V1…');
const assignQuery = `
  mutation($credId: ID!, $gsaKeyId: ID!) {
    androidAppCredentials {
      setGoogleServiceAccountKeyForFcmV1(id: $credId, googleServiceAccountKeyId: $gsaKeyId) {
        id
        googleServiceAccountKeyForFcmV1 { id clientEmail projectIdentifier }
      }
    }
  }
`;
const assignData = await gql(assignQuery, { credId, gsaKeyId: gsaKey.id });
const final = assignData.androidAppCredentials.setGoogleServiceAccountKeyForFcmV1;
log(`FCM V1 credential set. credentials.id=${final.id} gsa.id=${final.googleServiceAccountKeyForFcmV1.id} client=${final.googleServiceAccountKeyForFcmV1.clientEmail} project=${final.googleServiceAccountKeyForFcmV1.projectIdentifier}`);
log('OK — preview profile now has FCM v1 credentials. Trigger `eas build --profile preview --platform android` to bake them into a new APK.');
