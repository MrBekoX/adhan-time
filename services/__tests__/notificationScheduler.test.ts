import { computeTargets } from '../notificationScheduler';
import type { PrayerTime, YearlyPrayerCache } from '../types';

import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';

function entry(date: string, override: Partial<PrayerTime['times']> = {}): PrayerTime {
  return {
    date: `${date}T00:00:00.000Z`,
    times: {
      imsak: '05:00',
      gunes: '06:30',
      ogle: '12:00',
      ikindi: '15:30',
      aksam: '18:00',
      yatsi: '19:30',
      ...override,
    },
  };
}

function range(start: string, days: number): PrayerTime[] {
  const out: PrayerTime[] = [];
  const d = new Date(`${start}T00:00:00.000Z`);
  for (let i = 0; i < days; i++) {
    out.push(entry(d.toISOString().slice(0, 10)));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const TZ = 'Europe/Berlin';

function makeCache(entries: PrayerTime[], tz = TZ): YearlyPrayerCache {
  return {
    districtId: '9541',
    year: 2026,
    fetchedAt: new Date().toISOString(),
    timezone: tz,
    entries,
  };
}

describe('computeTargets — V14 tz-aware rolling window', () => {
  it('includes the DST-forward day across the spring transition', () => {
    // Europe/Berlin DST forward = 2026-03-29 02:00 → 03:00 local
    // now = Berlin 2026-03-28 23:30 CET = 2026-03-28T22:30Z
    // OLD UTC-stride code would skip '2026-03-29' (jumps from 03-28 to 03-30).
    const now = new Date('2026-03-28T22:30:00Z');
    const cache = makeCache(range('2026-03-28', 12));

    const targets = computeTargets(cache, TZ, now, 10, [...PRAYER_KEYS]);

    const dateIsos = Array.from(new Set(targets.map((t) => t.dateIso))).sort();
    // Day 0 (03-28) prayers are all past; days 1..9 contribute → 9 distinct future dates
    expect(dateIsos).toContain('2026-03-29');
    expect(dateIsos).toContain('2026-04-06');
    expect(dateIsos).toHaveLength(9);
    expect(dateIsos[0]).toBe('2026-03-29');
    expect(dateIsos[dateIsos.length - 1]).toBe('2026-04-06');
  });

  it('produces 10 distinct local dates across the autumn DST back shift', () => {
    // Europe/Berlin DST end = 2026-10-25 03:00 → 02:00 local
    const now = new Date('2026-10-24T22:30:00Z');
    const cache = makeCache(range('2026-10-24', 12));

    const targets = computeTargets(cache, TZ, now, 10, [...PRAYER_KEYS]);

    const dateIsos = Array.from(new Set(targets.map((t) => t.dateIso))).sort();
    expect(dateIsos).toHaveLength(10);
    expect(dateIsos[0]).toBe('2026-10-25');
    expect(dateIsos[9]).toBe('2026-11-03');
  });

  it('skips past prayers but keeps future ones on the same day', () => {
    // 13:00 UTC = 15:00 Berlin (after ogle 12:00, before ikindi 15:30)
    const now = new Date('2026-05-02T13:00:00Z');
    const cache = makeCache(range('2026-05-01', 5));

    const targets = computeTargets(cache, TZ, now, 1, [...PRAYER_KEYS]);

    const keys = targets.map((t) => t.prayerKey);
    expect(keys).not.toContain('imsak');
    expect(keys).not.toContain('gunes');
    expect(keys).not.toContain('ogle');
    expect(keys).toContain('ikindi');
    expect(keys).toContain('aksam');
    expect(keys).toContain('yatsi');
  });

  it('honors enabledPrayers filter (5 prayers × 10 days = 50)', () => {
    const now = new Date('2026-05-02T00:00:00Z');
    const cache = makeCache(range('2026-05-02', 12));
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];

    const targets = computeTargets(cache, TZ, now, 10, enabled);

    expect(targets).toHaveLength(50);
  });

  it('skips days that have no entry in the cache', () => {
    const now = new Date('2026-05-02T00:00:00Z');
    const partial = [entry('2026-05-02'), entry('2026-05-04')];
    const cache = makeCache(partial);

    const targets = computeTargets(cache, TZ, now, 5, [...PRAYER_KEYS]);

    const dates = Array.from(new Set(targets.map((t) => t.dateIso))).sort();
    expect(dates).toEqual(['2026-05-02', '2026-05-04']);
  });
});

describe('computeTargets — V11 defensive parsing', () => {
  it('skips a single corrupt prayer time and keeps every other target', () => {
    const now = new Date('2026-05-02T00:00:00Z');
    const corrupt = entry('2026-05-02', { imsak: 'bogus' });
    const cache = makeCache([corrupt, ...range('2026-05-03', 11)]);

    const targets = computeTargets(cache, TZ, now, 10, [...PRAYER_KEYS]);

    // Day 0 contributes 5 (imsak skipped); days 1..9 contribute 6 each = 54.
    expect(targets).toHaveLength(5 + 9 * 6);
    expect(targets.find((t) => t.dateIso === '2026-05-02' && t.prayerKey === 'imsak')).toBeUndefined();
    expect(targets.find((t) => t.dateIso === '2026-05-02' && t.prayerKey === 'gunes')).toBeDefined();
  });

  it('does not throw when every prayer on a day is corrupt', () => {
    const now = new Date('2026-05-02T00:00:00Z');
    const allBad: PrayerTime = {
      date: '2026-05-02T00:00:00.000Z',
      times: {
        imsak: 'xx:yy',
        gunes: '',
        ogle: 'noon',
        ikindi: '25:99',
        aksam: 'bad',
        yatsi: '',
      },
    };
    const cache = makeCache([allBad, ...range('2026-05-03', 11)]);

    expect(() => computeTargets(cache, TZ, now, 10, [...PRAYER_KEYS])).not.toThrow();
    const targets = computeTargets(cache, TZ, now, 10, [...PRAYER_KEYS]);
    // Only days 1..9 contribute (day 0 entirely lost).
    expect(targets).toHaveLength(9 * 6);
  });

  it('schedules 49 of 50 targets when one entry is corrupt (5 prayers × 10 days)', () => {
    const now = new Date('2026-05-02T00:00:00Z');
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
    const corruptDay = entry('2026-05-02', { aksam: '##:##' });
    const cache = makeCache([corruptDay, ...range('2026-05-03', 11)]);

    const targets = computeTargets(cache, TZ, now, 10, enabled);

    expect(targets).toHaveLength(49);
  });
});
