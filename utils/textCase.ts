/**
 * Lowercase a string under the user's active i18n locale rather than a
 * hardcoded 'tr'. Turkish has dotted/dotless-i rules that mangle other
 * Latin scripts (e.g. mapping İ to a plain `i` in EN context), so callers
 * should pass `i18n.language` and let the runtime apply the correct
 * Unicode case-folding rules.
 */
export function lowercaseInLocale(value: string, locale: string): string {
  return value.toLocaleLowerCase(locale);
}

export function normalizeSearchText(value: string, locale: string): string {
  return lowercaseInLocale(value, locale)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/['’`.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
