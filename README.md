# Adhan Time

Dünya geneli ezan vakti uygulaması (React Native + Expo + Supabase).

> Mimari, kurallar ve implementasyon şablonları için **`CLAUDE.md`** ve **`.claude/`** dizinine bak.

## Hızlı Başlangıç

```bash
# 1. Bağımlılıklar
npm install

# 2. Env
cp .env.example .env   # Supabase URL + key gir

# 3. Geliştirme (iOS/Android için development build gerekir, push test için zorunlu)
npx expo install --fix
eas build --profile development --platform ios   # veya android
npm run start
```

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run start` | Dev server |
| `npm run lint` | ESLint |
| `npm run type-check` | TS kontrol |
| `npm run test` | Jest |

## Push Test

Simulator'da push **gelmez**. Gerçek cihaz + development build zorunlu.
Detay: `.claude/rules/04-notifications.md` ve `.claude/rules/09-testing.md`.

## Lisans
Private.
