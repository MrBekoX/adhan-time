import {
  formatInTz,
  isWithinPrayerWindow,
  localTimestampToUtc,
  localYearInTz,
} from './push-window';

describe('localTimestampToUtc', () => {
  it('converts Istanbul wall clock to UTC instant (UTC+3, no DST)', () => {
    const utc = localTimestampToUtc('2026-05-02', '13:06', 'Europe/Istanbul');
    expect(utc.toISOString()).toBe('2026-05-02T10:06:00.000Z');
  });

  it('handles New York during EDT (UTC-4)', () => {
    const utc = localTimestampToUtc('2026-07-04', '06:00', 'America/New_York');
    expect(utc.toISOString()).toBe('2026-07-04T10:00:00.000Z');
  });

  it('handles Tokyo (UTC+9)', () => {
    const utc = localTimestampToUtc('2027-01-01', '07:00', 'Asia/Tokyo');
    expect(utc.toISOString()).toBe('2026-12-31T22:00:00.000Z');
  });
});

describe('isWithinPrayerWindow (V12 — 60s match)', () => {
  it('matches at the exact prayer minute', () => {
    const now = new Date('2026-05-02T10:06:00Z');
    expect(isWithinPrayerWindow('2026-05-02', '13:06', 'Europe/Istanbul', now)).toBe(true);
  });

  it('still matches 59 seconds after the prayer', () => {
    const now = new Date('2026-05-02T10:06:59Z');
    expect(isWithinPrayerWindow('2026-05-02', '13:06', 'Europe/Istanbul', now)).toBe(true);
  });

  it('rejects 60 seconds after the prayer (exclusive upper bound)', () => {
    const now = new Date('2026-05-02T10:07:00Z');
    expect(isWithinPrayerWindow('2026-05-02', '13:06', 'Europe/Istanbul', now)).toBe(false);
  });

  it('rejects one second before the prayer', () => {
    const now = new Date('2026-05-02T10:05:59Z');
    expect(isWithinPrayerWindow('2026-05-02', '13:06', 'Europe/Istanbul', now)).toBe(false);
  });

  it('respects custom window length', () => {
    const now = new Date('2026-05-02T10:08:30Z');
    // default 60s → false; 5min window → true
    expect(isWithinPrayerWindow('2026-05-02', '13:06', 'Europe/Istanbul', now)).toBe(false);
    expect(isWithinPrayerWindow('2026-05-02', '13:06', 'Europe/Istanbul', now, 5 * 60_000)).toBe(
      true,
    );
  });
});

describe('localYearInTz (V13)', () => {
  it('returns 2027 for 2026-12-31 22:00 UTC in Asia/Tokyo', () => {
    expect(localYearInTz(new Date('2026-12-31T22:00:00Z'), 'Asia/Tokyo')).toBe(2027);
  });

  it('returns 2026 for 2027-01-01 02:00 UTC in America/New_York', () => {
    expect(localYearInTz(new Date('2027-01-01T02:00:00Z'), 'America/New_York')).toBe(2026);
  });

  it('returns the same year for an instant well inside the year', () => {
    expect(localYearInTz(new Date('2026-06-15T12:00:00Z'), 'Europe/Istanbul')).toBe(2026);
  });
});

describe('formatInTz', () => {
  it('formats yyyy-MM-dd using the local calendar', () => {
    expect(formatInTz(new Date('2026-12-31T22:00:00Z'), 'Asia/Tokyo', 'yyyy-MM-dd')).toBe(
      '2027-01-01',
    );
  });

  it('formats HH:mm using the local clock', () => {
    expect(formatInTz(new Date('2026-05-02T10:06:00Z'), 'Europe/Istanbul', 'HH:mm')).toBe('13:06');
  });

  it('normalizes hour 24 to 00', () => {
    // Some Intl implementations report hour=24 at midnight; the helper must clamp to 00.
    expect(formatInTz(new Date('2026-05-02T21:00:00Z'), 'Europe/Istanbul', 'HH:mm')).toBe('00:00');
  });
});
