import { addDays, formatHHMM, getDateComponentsInTz, parsePrayerTime } from './time';

describe('parsePrayerTime', () => {
  it('parses Istanbul time correctly (UTC+3)', () => {
    const d = parsePrayerTime('05:54', '2026-05-02T00:00:00.000Z', 'Europe/Istanbul');
    expect(d.toISOString()).toBe('2026-05-02T02:54:00.000Z');
  });

  it('parses New York time during DST (UTC-4)', () => {
    const d = parsePrayerTime('06:00', '2026-05-02T00:00:00.000Z', 'America/New_York');
    expect(d.toISOString()).toBe('2026-05-02T10:00:00.000Z');
  });

  it('throws on invalid format', () => {
    expect(() => parsePrayerTime('xx:yy', '2026-05-02', 'Europe/Istanbul')).toThrow();
  });
});

describe('getDateComponentsInTz', () => {
  it('returns local components in target tz', () => {
    const c = getDateComponentsInTz(new Date('2026-05-02T02:54:00.000Z'), 'Europe/Istanbul');
    expect(c).toEqual({ year: 2026, month: 5, day: 2, hour: 5, minute: 54 });
  });
});

describe('addDays', () => {
  it('adds days in UTC space', () => {
    const start = new Date('2026-05-02T00:00:00.000Z');
    expect(addDays(start, 3).toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });
});

describe('formatHHMM', () => {
  it('formats in tz', () => {
    expect(formatHHMM(new Date('2026-05-02T02:54:00.000Z'), 'Europe/Istanbul')).toBe('05:54');
  });
});
