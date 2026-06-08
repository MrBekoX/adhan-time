import { interpolate, prayerBody, prayerTitle, reminderBody, reminderTitle } from './i18n';

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

describe('reminderTitle', () => {
  it('returns the localized reminder title (tr)', () => {
    expect(reminderTitle('tr')).toBe('Yaklaşıyor');
  });
  it('returns the localized reminder title (en)', () => {
    expect(reminderTitle('en')).toBe('Coming up');
  });
  it('falls back to tr for an unknown locale', () => {
    expect(reminderTitle('xx')).toBe('Yaklaşıyor');
  });
});

describe('reminderBody', () => {
  it('interpolates prayer name + minutes (tr)', () => {
    expect(reminderBody('tr', 'ogle', 10)).toBe('Öğle vaktine 10 dk kaldı.');
  });
  it('interpolates prayer name + minutes (en)', () => {
    expect(reminderBody('en', 'ogle', 10)).toBe('10 min to Dhuhr.');
  });
  it('falls back to tr for an unknown locale', () => {
    expect(reminderBody('xx', 'imsak', 5)).toBe('İmsak vaktine 5 dk kaldı.');
  });
});
