# Adhan Time

Dünya geneli ezan vakti uygulaması (React Native + Expo + Supabase).

> Mimari özet ve komutlar için aşağıya bakın. Kod katmanları: `app/`, `components/`, `hooks/`, `services/`, `store/`, `utils/`, `constants/`, `locales/`, `supabase/`.

---

## İlk Kurulum (Sırayla)

### 1. Bağımlılıklar

```bash
cd adhan-time
npm install
npx expo install --fix    # SDK ile uyumlu versiyonlara hizala
```

### 2. Env Değişkenleri

`.env` dosyası mevcut (Supabase URL + publishable key dolu).
Production veya başka cihaz için: `.env.example`'ı `.env`'e kopyalayıp doldur.

APK / EAS build için `EXPO_PUBLIC_REGISTER_HMAC_KEY` zorunludur (Supabase
`REGISTER_HMAC_KEY` ile aynı değer; aksi halde telefon `register-device`
isteğini imzalayamaz). Ortamı build'den önce doğrula:

```bash
npm run validate:build-env
```

### 3. EAS Projesi

```bash
npm i -g eas-cli
eas login
eas init                  # `app.json` içine projectId yazılır
```

### 4. Supabase Vault Secret'ları (pg_cron için)

Supabase Dashboard > Database > Vault > **New Secret**:

- `supabase_url` → `https://<your-project-ref>.supabase.co`
- `service_role_key` → Dashboard > Project Settings > API > **service_role secret** kopyala

### 5. pg_cron Migration

Vault dolduktan sonra Dashboard > SQL Editor'da `supabase/migrations/20260502000100_pg_cron.sql` içeriğini çalıştır. Cron her dakika `push-prayer` edge function'ını tetikleyecek.

### 6. (Opsiyonel) Expo Push Token Güvenliği

```bash
supabase secrets set EXPO_ACCESS_TOKEN=<token>
```

Token: https://expo.dev → Account Settings → Access Tokens → "Enhanced Security for Push Notifications" aç.

### 7. Asset'ler (kullanıcı sağlar)

`assets/images/icon.png` (1024×1024), `adaptive-icon.png`, `favicon.png` ve `assets/sounds/notification.wav` (≤30 sn bildirim sesi) `app.json`'daki ilgili anahtarlara bağlı.

### 8. Android Push (FCM v1) — zorunlu

Android push token (`Notifications.getExpoPushTokenAsync`) FCM olmadan **runtime'da
çöker** ve banner "Bildirim kimliği şu anda alınamıyor" gösterir. İki ayrı parça gerekir:

1. **İstemci config** — `google-services.json` (proje + app id + paket-kısıtlı API key).
   `app.json` → `android.googleServicesFile` buna referans verir; dosya yoksa prebuild
   fail eder. Dosya `.gitignore`'da (commit edilmez) ama `.easignore` onu hariç
   tutmadığı için EAS Build APK'ya gömer. Servis hesabı anahtarından üret:
   ```bash
   node tools/scripts/fetch-google-services.mjs <firebase-service-account.json>
   ```
2. **Sunucu kimliği** — FCM v1 servis hesabı anahtarı EAS'a yüklenir (Expo'nun push
   servisi FCM'e gönderebilsin). Bu olmadan banner gitmez ama gönderim de olmaz:
   ```bash
   eas credentials   # Android → <profile> → Google Service Account → Manage FCM V1 → upload
   ```

> `npm run validate:build-env` (ve EAS'ta `eas-build-pre-install` hook'u) FCM dosyası
> veya zorunlu env eksikse build'i **baştan reddeder** — bozuk APK göndermez.

### 9. Development Build

```bash
eas build --profile development --platform ios     # veya android
# Cihaza yükle, ardından:
npm run start
```

> **Push test simulator'da çalışmaz.** Gerçek cihaz + development build zorunlu.

---

## Komutlar

| Komut                        | Açıklama                                |
| ---------------------------- | --------------------------------------- |
| `npm run start`              | Dev server                              |
| `npm run lint`               | ESLint                                  |
| `npm run type-check`         | `tsc --noEmit`                          |
| `npm run test`               | Jest                                    |
| `npm run validate:build-env` | Build öncesi env + FCM dosyası kontrolü |

PR öncesi yerel kontrol: `npm run lint`, `npm run type-check`, `npm run test` (CI bunları zorunlu kılar).

---

## Mimari Özet

```
app/                  Expo Router (file-based)
components/           Saf, presentational UI
hooks/                useStore + useEffect orkestrasyon
services/             Network, scheduler, push, supabase
store/                Zustand slices (location, prayer, settings, ui)
utils/                Saf yardımcılar (time, envelope, logger)
constants/            Sabit veri (api paths, prayers, timezones)
locales/              tr.json, en.json, i18n setup
supabase/             migrations + edge functions
```

Bağımlılık yönü: `app/ → store/ → services/ → utils/`; `components/` saf ve presentational, veriyi prop / `useStore` ile alır.

---

## Backend Durumu

| Bileşen                                 | Durum                                 |
| --------------------------------------- | ------------------------------------- |
| Supabase project (`<your-project-ref>`) | ACTIVE_HEALTHY (ap-southeast-2)       |
| Migration `init_devices_cache_log`      | ✅ uygulandı                          |
| Edge function `register-device`         | ✅ deployed (v1)                      |
| Edge function `push-prayer`             | ✅ deployed (v1)                      |
| pg_cron job `push-prayer-every-minute`  | ⏳ manuel kurulum (yukarıda 4-5 adım) |

---

## Lisans

[MIT](LICENSE) — bu proje MIT lisansı altında dağıtılır.
