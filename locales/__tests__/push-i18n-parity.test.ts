/**
 * I1 — Mobile prayer.* JSON ↔ supabase/functions/_shared/i18n.json parity.
 *
 * Push notifications are rendered both on-device (local schedule) and from
 * the Supabase edge function (cron fallback). Both sides MUST emit the same
 * copy for a given (locale, prayer) pair, otherwise users see one wording
 * when the app is open and a different one when the cron fires.
 *
 * The shared file at supabase/functions/_shared/i18n.json is the source of
 * truth on the server; this test guarantees it stays in lock-step with the
 * mobile catalog after every translation change.
 */
import fs from 'fs';
import path from 'path';

import ar from '../ar.json';
import en from '../en.json';
import tr from '../tr.json';
import zh from '../zh.json';

const SHARED_PATH = path.resolve(
  __dirname,
  '../../supabase/functions/_shared/i18n.json',
);

type PrayerCopy = { title: string; body: string; bodyWithCity: string };
type SharedShape = Record<string, { prayer: Record<string, PrayerCopy> }>;

const mobileByLocale = { tr, en, ar, zh } as const;

describe('push-prayer i18n parity', () => {
  it('shared file exists', () => {
    expect(fs.existsSync(SHARED_PATH)).toBe(true);
  });

  it.each(['tr', 'en', 'ar', 'zh'] as const)(
    'shared.%s.prayer.* equals mobile %s prayer.*',
    (locale) => {
      const sharedRaw = fs.readFileSync(SHARED_PATH, 'utf8');
      const shared = JSON.parse(sharedRaw) as SharedShape;
      const mobile = mobileByLocale[locale] as { prayer: Record<string, PrayerCopy> };
      expect(shared[locale]?.prayer).toEqual(mobile.prayer);
    },
  );
});
