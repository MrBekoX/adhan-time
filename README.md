# Adhan Time

Dünya geneli ezan vakti uygulaması (React Native + Expo + Supabase).

> Mimari, kurallar ve implementasyon şablonları için **`CLAUDE.md`** ve **`.claude/`** dizinine bak.

---

## İlk Kurulum (Sırayla)

### 1. Bağımlılıklar

```bash
cd D:/adhan-time
npm install
npx expo install --fix    # SDK ile uyumlu versiyonlara hizala
```

### 2. Env Değişkenleri

`.env` dosyası mevcut (Supabase URL + publishable key dolu).
Production veya başka cihaz için: `.env.example`'ı `.env`'e kopyalayıp doldur.

### 3. EAS Projesi

```bash
npm i -g eas-cli
eas login
eas init                  # `app.json` içine projectId yazılır
```

### 4. Supabase Vault Secret'ları (pg_cron için)

Supabase Dashboard > Database > Vault > **New Secret**:
- `supabase_url` → `https://ckrvxajivwkifticnqom.supabase.co`
- `service_role_key` → Dashboard > Project Settings > API > **service_role secret** kopyala

### 5. pg_cron Migration

Vault dolduktan sonra Dashboard > SQL Editor'da `supabase/migrations/20260502000100_pg_cron.sql` içeriğini çalıştır. Cron her dakika `push-prayer` edge function'ını tetikleyecek.

### 6. (Opsiyonel) Expo Push Token Güvenliği

```bash
supabase secrets set EXPO_ACCESS_TOKEN=<token>
```
Token: https://expo.dev → Account Settings → Access Tokens → "Enhanced Security for Push Notifications" aç.

### 7. Asset'ler (kullanıcı sağlar)

`assets/images/icon.png` (1024×1024), `adaptive-icon.png`, `favicon.png` ve opsiyonel `assets/sounds/adhan_short.wav` (≤30 sn) ekleyince `app.json`'daki ilgili anahtarları geri aç.

### 8. Development Build

```bash
eas build --profile development --platform ios     # veya android
# Cihaza yükle, ardından:
npm run start
```

> **Push test simulator'da çalışmaz.** Gerçek cihaz + development build zorunlu.

---

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run start` | Dev server |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test` | Jest |

Slash komutlar: `.claude/commands/` altında. Örn `/commit`, `/supabase-deploy`, `/eas-build`, `/prayer-test`.

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

Detay: `CLAUDE.md` ve `.claude/rules/01-architecture.md`.

---

## Backend Durumu

| Bileşen | Durum |
|---|---|
| Supabase project (`ckrvxajivwkifticnqom`) | ACTIVE_HEALTHY (ap-southeast-2) |
| Migration `init_devices_cache_log` | ✅ uygulandı |
| Edge function `register-device` | ✅ deployed (v1) |
| Edge function `push-prayer` | ✅ deployed (v1) |
| pg_cron job `push-prayer-every-minute` | ⏳ manuel kurulum (yukarıda 4-5 adım) |

---

## Lisans
Private.
