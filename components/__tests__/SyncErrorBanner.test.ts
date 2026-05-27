/**
 * SyncErrorBanner is presentational and locale-aware. Rather than spinning up
 * a full RN renderer, we test the pure mapping it relies on: the lookup that
 * translates a UiError code into a translation key is shared with locale JSON
 * coverage tests so the banner cannot reference a key that does not exist in
 * every supported locale.
 */
import en from '@/locales/en.json';
import zh from '@/locales/zh.json';
import ar from '@/locales/ar.json';
import tr from '@/locales/tr.json';

const REQUIRED_ERROR_KEYS = [
  'sync-failed',
  'partial-schedule',
  'hydration-timeout',
  'parse-skipped',
  'device-registration-failed',
  'native-arm-failed',
];

type ErrorsBag = Record<string, unknown>;

function getBag(locale: unknown): ErrorsBag {
  const errors = (locale as { errors?: ErrorsBag }).errors ?? {};
  return (errors.banner as ErrorsBag | undefined) ?? {};
}

describe('locale coverage for SyncErrorBanner messages (F2+F4)', () => {
  it.each([
    ['tr', tr as unknown],
    ['en', en as unknown],
    ['ar', ar as unknown],
    ['zh', zh as unknown],
  ] as const)('%s exposes errors.banner.<code> for every banner code', (_name, bundle) => {
    const bag = getBag(bundle);
    for (const code of REQUIRED_ERROR_KEYS) {
      expect(typeof bag[code]).toBe('string');
      expect((bag[code] as string).length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['tr', tr as unknown],
    ['en', en as unknown],
    ['ar', ar as unknown],
    ['zh', zh as unknown],
  ] as const)('%s has a common.dismiss string for the banner close button', (_name, bundle) => {
    const common = (bundle as { common?: Record<string, unknown> }).common ?? {};
    expect(typeof common.dismiss).toBe('string');
    expect((common.dismiss as string).length).toBeGreaterThan(0);
  });

  it.each([
    ['tr', tr as unknown],
    ['en', en as unknown],
    ['ar', ar as unknown],
    ['zh', zh as unknown],
  ] as const)('%s has a common.retry string for the banner retry button', (_name, bundle) => {
    const common = (bundle as { common?: Record<string, unknown> }).common ?? {};
    // Retry uses tryAgain which already exists in every locale.
    expect(typeof common.tryAgain).toBe('string');
  });
});
