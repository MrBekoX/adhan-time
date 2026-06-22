# Contributing to Adhan Time

Thanks for your interest in contributing! Adhan Time is a worldwide Muslim
prayer-times app (React Native + Expo + Supabase). This guide explains how to
set up the project and get a change merged.

## Prerequisites

- **Node.js >= 20** (see `.nvmrc` — run `nvm use`)
- npm (the repo uses `package-lock.json`)
- Expo tooling (`npx expo`), and for device builds: an Expo/EAS account
- A physical device for any **push-notification** work — push does **not** work
  on the iOS Simulator and is unreliable on the Android emulator (no FCM).

## Setup

```bash
# 1. Fork, then clone your fork
git clone https://github.com/<you>/adhan-time.git
cd adhan-time

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
#   Fill in your own EXPO_PUBLIC_SUPABASE_URL / ANON key and the other
#   EXPO_PUBLIC_* values. Never commit a real .env — it is git-ignored.

# 4. Start the dev server
npm run start
```

## Quality gates (run before every PR)

CI enforces all of these on every pull request:

```bash
npm run lint          # ESLint (max-warnings=0)
npm run type-check    # tsc --noEmit
npm run test          # Jest
npm run secrets:scan  # private-key / credential scan
```

> Note: this repo does **not** ship git hooks, so these checks do **not** run
> automatically on your machine. Please run them manually before pushing — a PR
> that fails any of them will be blocked by CI.

## Branches & commits

- Branch off `main`: `feat/*`, `fix/*`, `chore/*`, `docs/*`.
- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(notifications): ...`, `fix(api): ...`, `chore(ci): ...`.
- Keep one focus per pull request.

## Pull requests

1. Make sure the quality gates above pass.
2. Fill in the PR template checklist.
3. For notification / native / timezone changes, include a short note about how
   you verified the behavior on a real device.

## Areas that need extra care

- **Notifications & timezones** are religious-accuracy critical — prayer times
  must fire in the selected city's IANA timezone, never a fixed offset. Test
  across DST boundaries when relevant.
- **Supabase migrations** are forward-only: never edit an already-applied
  migration; add a new one instead.

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
