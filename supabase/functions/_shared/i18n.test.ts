import { interpolate, prayerBody, prayerTitle } from './i18n';

describe('i18n.interpolate', () => {
  it('replaces a single placeholder', () => {
    expect(interpolate('Hello {{name}}', { name: 'Beko' })).toBe('Hello Beko');
  });
  it('replaces multiple placeholders', () => {
    expect(interpolate('{{a}}-{{b}}', { a: 'x', b: 'y' })).toBe('x-y');
  });
  it('leaves unknown placeholders intact', () => {
    expect(interpolate('Hi {{who}}', {})).toBe('Hi {{who}}');
  });
});

describe('prayerTitle', () => {
  it('returns the localized title for a known prayer (tr)', () => {
    expect(prayerTitle('tr', 'imsak')).toBe('İmsak');
  });
  it('returns the localized title for a known prayer (en)', () => {
    expect(prayerTitle('en', 'ogle')).toBe('Dhuhr');
  });
  it('returns the localized title for a known prayer (ar)', () => {
    expect(prayerTitle('ar', 'aksam')).toBe('المغرب');
  });
  it('returns the localized title for a known prayer (zh)', () => {
    expect(prayerTitle('zh', 'yatsi')).toBe('宵礼');
  });
  it('falls back to tr for an unknown locale', () => {
    expect(prayerTitle('xx', 'imsak')).toBe('İmsak');
  });
});

describe('prayerBody', () => {
  it('interpolates the city into the localized body (tr)', () => {
    expect(prayerBody('tr', 'imsak', 'İstanbul')).toBe(
      'İstanbul için imsak vakti girdi.',
    );
  });
  it('interpolates the city into the localized body (en)', () => {
    expect(prayerBody('en', 'gunes', 'Cairo')).toBe('Sun has risen in Cairo.');
  });
  it('falls back to tr for an unknown locale', () => {
    expect(prayerBody('xx', 'yatsi', 'Ankara')).toBe(
      'Ankara için yatsı vakti girdi.',
    );
  });
});
