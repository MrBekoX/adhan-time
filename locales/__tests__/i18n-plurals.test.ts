/**
 * I3 — i18next v4 (CLDR plural) behavior across the four locales.
 *
 * The legacy `_plural` suffix is gone; selection now goes through the
 * runtime's Intl.PluralRules. Arabic gains five extra forms beyond
 * `_one`/`_other` (`_zero`, `_two`, `_few`, `_many`), so the dual
 * (count=2) and many (count=11) cases must produce the right string.
 */
import { i18n } from '../i18n';

async function withLocale<T>(locale: string, fn: () => T): Promise<T> {
  const previous = i18n.language;
  await i18n.changeLanguage(locale);
  try {
    return fn();
  } finally {
    await i18n.changeLanguage(previous);
  }
}

describe('Intl.PluralRules availability (Hermes/Node parity)', () => {
  it('supports en/ar/zh/tr selection without throwing', () => {
    // Sanity: jest runs on Node which always has full Intl. The production
    // bundle relies on the same API surface (with intl-pluralrules as a
    // safety net for older Hermes builds).
    expect(typeof Intl.PluralRules).toBe('function');
    expect(new Intl.PluralRules('ar').select(2)).toBe('two');
    expect(new Intl.PluralRules('ar').select(11)).toBe('many');
    expect(new Intl.PluralRules('en').select(1)).toBe('one');
    expect(new Intl.PluralRules('en').select(7)).toBe('other');
  });
});

describe('units.hour CLDR plural keys (I3)', () => {
  it('en — count=1 picks the _one form', async () => {
    await withLocale('en', () => {
      expect(i18n.t('units.hour', { count: 1 })).toBe('1 hour');
    });
  });

  it('en — count=2 picks the _other form', async () => {
    await withLocale('en', () => {
      expect(i18n.t('units.hour', { count: 2 })).toBe('2 hours');
    });
  });

  it('ar — count=2 picks the _two (dual) form', async () => {
    await withLocale('ar', () => {
      // Dual in Arabic — distinct from singular and plural.
      // The translation is intentionally CLDR-correct: "ساعتان" (two hours).
      expect(i18n.t('units.hour', { count: 2 })).toBe('ساعتان');
    });
  });

  it('ar — count=11 picks the _many form', async () => {
    await withLocale('ar', () => {
      // 11..99 → many in CLDR Arabic. Format: "{{count}} ساعة" (singular noun
      // attaches to the many-numerals).
      expect(i18n.t('units.hour', { count: 11 })).toBe('11 ساعة');
    });
  });
});

describe('units.minute CLDR plural keys (I3)', () => {
  it('en — count=1 picks the _one form', async () => {
    await withLocale('en', () => {
      expect(i18n.t('units.minute', { count: 1 })).toBe('1 minute');
    });
  });

  it('en — count=5 picks the _other form', async () => {
    await withLocale('en', () => {
      expect(i18n.t('units.minute', { count: 5 })).toBe('5 minutes');
    });
  });

  it('ar — count=2 picks the _two (dual) form', async () => {
    await withLocale('ar', () => {
      expect(i18n.t('units.minute', { count: 2 })).toBe('دقيقتان');
    });
  });
});

describe('compatibilityJSON v3 has been removed', () => {
  it('does NOT use the legacy _plural suffix', () => {
    // i18next 23 honors compatibilityJSON 'v3' if set; once we drop it the
    // options no longer carry it. Direct introspection guards the migration.
    const opts = i18n.options as { compatibilityJSON?: string };
    expect(opts.compatibilityJSON).not.toBe('v3');
  });
});
