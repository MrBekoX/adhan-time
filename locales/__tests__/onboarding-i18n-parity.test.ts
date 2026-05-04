/**
 * I2 — every onboarding chapter eyebrow must exist in all four locales,
 * so a translation drift (e.g. someone adds a new chapter only to TR)
 * fails CI before users see a hardcoded English string in production.
 */
import ar from '../ar.json';
import en from '../en.json';
import tr from '../tr.json';
import zh from '../zh.json';

const REQUIRED_CHAPTER_KEYS = ['i', 'ii', 'iii', 'iv', 'final'] as const;

type OnboardingShape = {
  chapterEyebrow?: Record<string, string>;
  notificationsForCity?: string;
};

const catalogs = {
  tr: tr.screens.onboarding as OnboardingShape,
  en: en.screens.onboarding as OnboardingShape,
  ar: ar.screens.onboarding as OnboardingShape,
  zh: zh.screens.onboarding as OnboardingShape,
};

describe('onboarding i18n parity (I2)', () => {
  it.each(['tr', 'en', 'ar', 'zh'] as const)(
    '%s defines all 5 chapter eyebrows + notificationsForCity',
    (locale) => {
      const cat = catalogs[locale];
      expect(cat.chapterEyebrow).toBeDefined();
      for (const key of REQUIRED_CHAPTER_KEYS) {
        expect(typeof cat.chapterEyebrow?.[key]).toBe('string');
        expect((cat.chapterEyebrow?.[key] ?? '').length).toBeGreaterThan(0);
      }
      expect(typeof cat.notificationsForCity).toBe('string');
      expect((cat.notificationsForCity ?? '').length).toBeGreaterThan(0);
    },
  );
});
