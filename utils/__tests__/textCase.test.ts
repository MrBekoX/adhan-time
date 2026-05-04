/**
 * I4+I5 — locale-aware lowercase. Hard-coding `toLocaleLowerCase('tr')` was
 * mangling Latin scripts under non-Turkish locales (e.g. en) where Turkish
 * dotless-i rules don't apply, so the helper now defers to the active i18n
 * language passed by callers.
 */
import { lowercaseInLocale } from '../textCase';

describe('lowercaseInLocale', () => {
  it("applies Turkish casing when locale is 'tr' (İ → i)", () => {
    expect(lowercaseInLocale('TÜRKİYE', 'tr')).toBe('türkiye');
  });

  it("uses default Latin casing when locale is 'en' (İ → i̇)", () => {
    // The Turkish rule produces 'i' for capital İ; the default rule emits
    // i + combining dot above. The point of the helper is to use the *user's*
    // locale, not a hardcoded 'tr' that misrenders other languages.
    expect(lowercaseInLocale('İSTANBUL', 'en')).toBe('i̇stanbul');
  });

  it("treats Arabic strings as a no-op (no case in the script)", () => {
    expect(lowercaseInLocale('القاهرة', 'ar')).toBe('القاهرة');
  });
});
