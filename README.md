# Adhan Time

Worldwide Muslim prayer-times (adhan) app (React Native + Expo + Supabase).

> See below for an architecture overview and commands. Code layers: `app/`, `components/`, `hooks/`, `services/`, `store/`, `utils/`, `constants/`, `locales/`, `supabase/`.

---

## First-time Setup (in order)

### 1. Dependencies

```bash
cd adhan-time
npm install
npx expo install --fix    # align packages to SDK-compatible versions
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill it in (Supabase URL + publishable key).

For an APK / EAS build, `EXPO_PUBLIC_REGISTER_HMAC_KEY` is required (it must match
the Supabase `REGISTER_HMAC_KEY`; otherwise the device cannot sign its
`register-device` request). Validate the environment before building:

```bash
npm run validate:build-env
```

### 3. EAS project

```bash
npm i -g eas-cli
eas login
eas init                  # writes projectId into app.json
```

### 4. Supabase Vault secrets (for pg_cron)

Supabase Dashboard > Database > Vault > **New Secret**:

- `supabase_url` → `https://<your-project-ref>.supabase.co`
- `service_role_key` → copy from Dashboard > Project Settings > API > **service_role secret**

### 5. pg_cron migration

Once the Vault is populated, run the contents of
`supabase/migrations/20260502000100_pg_cron.sql` in Dashboard > SQL Editor. The
cron will trigger the `push-prayer` edge function every minute.

### 6. (Optional) Expo push token security

```bash
supabase secrets set EXPO_ACCESS_TOKEN=<token>
```

Token: https://expo.dev → Account Settings → Access Tokens → enable "Enhanced
Security for Push Notifications".

### 7. Assets (provided by you)

`assets/images/icon.png` (1024×1024), `adaptive-icon.png`, `favicon.png`, and
`assets/sounds/notification.wav` (≤30 s notification sound) are referenced by the
corresponding keys in `app.json`.

### 8. Android push (FCM v1) — required

Without FCM, the Android push token (`Notifications.getExpoPushTokenAsync`)
**crashes at runtime** and shows the banner "Notification ID currently
unavailable". Two separate pieces are needed:

1. **Client config** — `google-services.json` (project + app id + package-restricted
   API key). `app.json` → `android.googleServicesFile` references it; prebuild fails
   if the file is missing. The file is in `.gitignore` (never committed) but EAS Build
   still embeds it in the APK because `.easignore` does not exclude it. Generate it
   from a service-account key:
   ```bash
   node tools/scripts/fetch-google-services.mjs <firebase-service-account.json>
   ```
2. **Server credential** — the FCM v1 service-account key is uploaded to EAS (so
   Expo's push service can deliver to FCM). Without it the banner clears but delivery
   still fails:
   ```bash
   eas credentials   # Android → <profile> → Google Service Account → Manage FCM V1 → upload
   ```

> `npm run validate:build-env` (and the `eas-build-pre-install` hook on EAS)
> **rejects the build up front** if the FCM file or a required env var is missing —
> it won't ship a broken APK.

### 9. Development build

```bash
eas build --profile development --platform ios     # or android
# Install on the device, then:
npm run start
```

> **Push does not work on the simulator.** A physical device + development build is
> required.

---

## Commands

| Command                      | Description                    |
| ---------------------------- | ------------------------------ |
| `npm run start`              | Dev server                     |
| `npm run lint`               | ESLint                         |
| `npm run type-check`         | `tsc --noEmit`                 |
| `npm run test`               | Jest                           |
| `npm run validate:build-env` | Pre-build env + FCM file check |

Local check before opening a PR: `npm run lint`, `npm run type-check`,
`npm run test` (CI enforces all three).

---

## Architecture overview

```
app/                  Expo Router (file-based)
components/           Pure, presentational UI
hooks/                useStore + useEffect orchestration
services/             Network, scheduler, push, supabase
store/                Zustand slices (location, prayer, settings, ui)
utils/                Pure helpers (time, envelope, logger)
constants/            Static data (api paths, prayers, timezones)
locales/              tr.json, en.json, i18n setup
supabase/             migrations + edge functions
```

Dependency direction: `app/ → store/ → services/ → utils/`; `components/` are pure
and presentational, receiving data via props / `useStore`.

---

## Backend status

| Component                               | Status                            |
| --------------------------------------- | --------------------------------- |
| Supabase project (`<your-project-ref>`) | ACTIVE_HEALTHY (ap-southeast-2)   |
| Migration `init_devices_cache_log`      | ✅ applied                        |
| Edge function `register-device`         | ✅ deployed (v1)                  |
| Edge function `push-prayer`             | ✅ deployed (v1)                  |
| pg_cron job `push-prayer-every-minute`  | ⏳ manual setup (steps 4–5 above) |

---

## License

[MIT](LICENSE) — this project is distributed under the MIT License.
