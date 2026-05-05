// SHARED_I18N is generated from locales/*.json by `npm run build:supabase-i18n`
// so a mobile translation edit propagates to the cron fallback after one
// regen step. The plain TS module form keeps this importable from both the
// Deno edge runtime and Jest+Node without import.meta or JSON-attribute hacks.

import { SHARED_I18N } from './i18n.gen.ts';

const SUPPORTED_LOCALES = ['tr', 'en', 'ar', 'zh'] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
const FALLBACK_LOCALE: Locale = 'tr';

function normalizeLocale(loc: string): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(loc)
    ? (loc as Locale)
    : FALLBACK_LOCALE;
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export function prayerTitle(locale: string, key: string): string {
  const catalog = SHARED_I18N[normalizeLocale(locale)];
  const copy = catalog?.prayer?.[key as keyof typeof catalog.prayer];
  return copy?.title ?? key;
}

export function prayerBody(locale: string, key: string, city: string): string {
  const catalog = SHARED_I18N[normalizeLocale(locale)];
  const copy = catalog?.prayer?.[key as keyof typeof catalog.prayer];
  if (!copy) return key;
  return interpolate(copy.bodyWithCity, { city });
}
