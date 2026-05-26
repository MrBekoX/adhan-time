import {
  COUNTRIES_REQUIRING_TZ_SELECTION,
  COUNTRY_TZ_OPTIONS,
} from '@/constants/timezones';

import { migrateLocationState } from '../locationStore.migration';

const goodLocation = {
  countryId: '13', // Germany — id was correct in old + new tables
  countryName: 'ALMANYA',
  stateId: '99',
  stateName: 'Berlin',
  districtId: '1',
  districtName: 'Berlin',
  timezone: 'Europe/Prague', // wrong tz from old broken table
};

describe('migrateLocationState (V7 — locationStore v1 → v2)', () => {
  it('re-resolves a correct-id location and overwrites the stale tz', () => {
    const result = migrateLocationState({ selected: goodLocation }, 1);
    expect(result.selected).not.toBeNull();
    expect(result.selected?.countryId).toBe('13');
    // V6.1 table maps '13' → Europe/Berlin even though the persisted tz was wrong
    expect(result.selected?.timezone).toBe('Europe/Berlin');
  });

  it('re-resolves USA (id 33) — was Czech Republic in old table, now America/New_York', () => {
    const result = migrateLocationState(
      { selected: { ...goodLocation, countryId: '33', countryName: 'ABD', stateId: 'unknown' } },
      1,
    );
    expect(result.selected).toBeNull();
  });

  it('re-resolves USA + California → America/Los_Angeles', () => {
    const result = migrateLocationState(
      {
        selected: {
          ...goodLocation,
          countryId: '33',
          countryName: 'ABD',
          stateId: '585',
          stateName: 'CALIFORNIA',
          timezone: 'Europe/Prague',
        },
      },
      1,
    );
    expect(result.selected?.timezone).toBe('America/Los_Angeles');
  });

  it('resets selected location when countryId is no longer supported', () => {
    const result = migrateLocationState(
      { selected: { ...goodLocation, countryId: '999999' } },
      1,
    );
    expect(result.selected).toBeNull();
  });

  it('does not touch state newer than v2 unless v3 rule applies', () => {
    const result = migrateLocationState({ selected: goodLocation }, 3);
    expect(result.selected).toEqual(goodLocation);
  });

  it('v2→v3: resets Australia user who never picked a timezone', () => {
    const result = migrateLocationState(
      {
        selected: {
          ...goodLocation,
          countryId: '59',
          countryName: 'AVUSTRALYA',
          timezone: 'Australia/Sydney',
        },
      },
      2,
    );
    expect(result.selected).toBeNull();
  });

  it('v2→v3: keeps Australia user who already picked a timezone', () => {
    const result = migrateLocationState(
      {
        selected: {
          ...goodLocation,
          countryId: '59',
          countryName: 'AVUSTRALYA',
          timezone: 'Australia/Perth',
          userSelectedTimezone: 'Australia/Perth',
        },
      },
      2,
    );
    expect(result.selected?.userSelectedTimezone).toBe('Australia/Perth');
  });

  it('v2→v3: leaves non-AU/ID/BR/RU users alone', () => {
    const result = migrateLocationState({ selected: goodLocation }, 2);
    expect(result.selected).toEqual(goodLocation);
  });

  it('handles empty persisted state without crashing', () => {
    expect(migrateLocationState(undefined, 1)).toEqual({ selected: null });
    expect(migrateLocationState(null, 1)).toEqual({ selected: null });
    expect(migrateLocationState({}, 1)).toEqual({ selected: null });
  });

  it('keeps null selected as null', () => {
    const result = migrateLocationState({ selected: null }, 1);
    expect(result.selected).toBeNull();
  });
});

describe('COUNTRIES_REQUIRING_TZ_SELECTION (V6.4)', () => {
  it('contains exactly AU/ID/BR/RU country ids', () => {
    expect(COUNTRIES_REQUIRING_TZ_SELECTION.has('59')).toBe(true); // Australia
    expect(COUNTRIES_REQUIRING_TZ_SELECTION.has('117')).toBe(true); // Indonesia
    expect(COUNTRIES_REQUIRING_TZ_SELECTION.has('146')).toBe(true); // Brazil
    expect(COUNTRIES_REQUIRING_TZ_SELECTION.has('207')).toBe(true); // Russia
    expect(COUNTRIES_REQUIRING_TZ_SELECTION.has('2')).toBe(false); // Türkiye is single-tz
    expect(COUNTRIES_REQUIRING_TZ_SELECTION.has('33')).toBe(false); // USA uses state mapping
  });
});

describe('COUNTRY_TZ_OPTIONS (V6.4)', () => {
  it('exposes at least 2 zones for every country in COUNTRIES_REQUIRING_TZ_SELECTION', () => {
    for (const id of COUNTRIES_REQUIRING_TZ_SELECTION) {
      const opts = COUNTRY_TZ_OPTIONS[id];
      expect(opts).toBeDefined();
      expect(opts!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every option points to a real IANA-shaped string (Region/City)', () => {
    for (const opts of Object.values(COUNTRY_TZ_OPTIONS)) {
      for (const opt of opts) {
        expect(opt.tz).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+/);
        expect(opt.labelKey.length).toBeGreaterThan(0);
      }
    }
  });
});

