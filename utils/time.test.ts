import {
  addDays,
  addLocalDays,
  formatHHMM,
  getDateComponentsInTz,
  parsePrayerTime,
  yearInTz,
} from './time';

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

  it('throws on out-of-range hour', () => {
    expect(() => parsePrayerTime('25:00', '2026-05-02', 'Europe/Istanbul')).toThrow();
  });

  it('throws on out-of-range minute', () => {
    expect(() => parsePrayerTime('05:99', '2026-05-02', 'Europe/Istanbul')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parsePrayerTime('', '2026-05-02', 'Europe/Istanbul')).toThrow();
  });

  it('accepts a single-digit hour like 5:54', () => {
    const d = parsePrayerTime('5:54', '2026-05-02', 'Europe/Istanbul');
    expect(d.toISOString()).toBe('2026-05-02T02:54:00.000Z');
  });

  // Morocco (Africa/Casablanca) is the trickiest worldwide tz: permanent UTC+1,
  // but it SUSPENDS DST to UTC+0 for the month of Ramadan. We never hardcode
  // offsets — the IANA db (via date-fns-tz) must shift correctly across that
  // suspension, or prayer notifications would be 1 hour off all Ramadan.
  it('parses Casablanca at the standard UTC+1 offset outside Ramadan', () => {
    const d = parsePrayerTime('12:00', '2026-01-15', 'Africa/Casablanca');
    expect(d.toISOString()).toBe('2026-01-15T11:00:00.000Z');
  });

  it('parses Casablanca at UTC+0 during Ramadan (DST suspended)', () => {
    // 2026-03-01 falls inside Ramadan 1447 (≈18 Feb – 19 Mar 2026).
    const d = parsePrayerTime('12:00', '2026-03-01', 'Africa/Casablanca');
    expect(d.toISOString()).toBe('2026-03-01T12:00:00.000Z');
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

describe('yearInTz', () => {
  it('returns UTC year when tz aligns with UTC', () => {
    expect(yearInTz(new Date('2026-06-15T12:00:00Z'), 'UTC')).toBe(2026);
  });

  it('returns local year when local clock crosses year boundary before UTC', () => {
    // 2026-12-31 22:00 UTC == 2027-01-01 07:00 Asia/Tokyo
    expect(yearInTz(new Date('2026-12-31T22:00:00Z'), 'Asia/Tokyo')).toBe(2027);
  });

  it('returns local year when local clock is still in previous year', () => {
    // 2027-01-01 02:00 UTC == 2026-12-31 21:00 America/New_York (EST = -05)
    expect(yearInTz(new Date('2027-01-01T02:00:00Z'), 'America/New_York')).toBe(2026);
  });
});

describe('addLocalDays', () => {
  it('advances within the same month', () => {
    expect(addLocalDays('2026-05-02', 3)).toBe('2026-05-05');
  });

  it('crosses month boundary', () => {
    expect(addLocalDays('2026-05-30', 3)).toBe('2026-06-02');
  });

  it('crosses year boundary', () => {
    expect(addLocalDays('2026-12-25', 10)).toBe('2027-01-04');
  });

  it('does not lose a day across DST forward shift (Mar 29, 2026 Europe/Istanbul has no DST but check Europe/Berlin)', () => {
    // March 29, 2026 = DST forward in Europe/Berlin; addLocalDays must remain calendar-arithmetic
    expect(addLocalDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addLocalDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('produces 10 distinct days when used to build a 10-day rolling window', () => {
    const start = '2026-03-28';
    const days = Array.from({ length: 10 }, (_, i) => addLocalDays(start, i));
    expect(new Set(days).size).toBe(10);
    expect(days[0]).toBe('2026-03-28');
    expect(days[9]).toBe('2026-04-06');
  });
});
