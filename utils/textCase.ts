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
