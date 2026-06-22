# Security Policy

## Supported versions

This project is actively developed; only the latest `main` and the most recent
released build receive security fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** (Privately report a vulnerability).
3. Provide a clear description, reproduction steps, and the potential impact.

We will acknowledge your report as soon as possible and keep you updated on the
fix. Please give us a reasonable amount of time to address the issue before any
public disclosure.

## Scope notes

- Client-facing values prefixed with `EXPO_PUBLIC_` (e.g. the Supabase project
  URL and anon/publishable key) are **publishable by design** and are not
  considered secrets.
- Server-side secrets (Supabase `service_role` key, cron secret, Expo access
  token) live only in environment variables / Supabase Vault and are never
  committed. If you ever find such a secret in the repository or its history,
  please report it privately using the steps above.
