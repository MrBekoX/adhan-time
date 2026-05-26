import type { YearlyPrayerCache } from '@/services/types';

import { getNextPrayer } from '../useNextPrayer';
import { selectTodayPrayers } from '../useTodayPrayers';

const baseLocation = {
  countryId: '2',
  stateId: '500',
  districtId: '9541',
  name: 'Istanbul',
  timezone: 'Europe/Istanbul',
};

const makeCache = (overrides: Partial<YearlyPrayerCache> = {}): YearlyPrayerCache => ({
  districtId: '9541',
  timezone: 'Europe/Istanbul',
  year: 2026,
  fetchedAt: '2026-05-26T00:00:00.000Z',
  entries: [
    {
      date: '2026-05-27',
      times: {
        imsak: '04:00',
        gunes: '05:35',
        ogle: '13:05',
        ikindi: '17:00',
        aksam: '20:25',
        yatsi: '21:55',
      },
    },
  ],
  ...overrides,
});

describe('prayer selectors', () => {
  it('does not expose cached rows for a different selected district', () => {
    const rows = selectTodayPrayers(
      makeCache({ districtId: 'old-district' }),
      baseLocation,
      new Date('2026-05-27T09:00:00.000Z'),
    );

    expect(rows).toBeNull();
  });

  it('does not expose cached rows when the selected timezone changed', () => {
    const rows = selectTodayPrayers(
      makeCache({ timezone: 'America/New_York' }),
      baseLocation,
      new Date('2026-05-27T09:00:00.000Z'),
    );

    expect(rows).toBeNull();
  });

  it('uses selected-city calendar days across a DST transition', () => {
    const cache = makeCache({
      timezone: 'Europe/Berlin',
      entries: [
        {
          date: '2026-03-28',
          times: {
            imsak: '04:20',
            gunes: '05:50',
            ogle: '12:15',
            ikindi: '15:30',
            aksam: '18:35',
            yatsi: '20:00',
          },
        },
        {
          date: '2026-03-29',
          times: {
            imsak: '05:00',
            gunes: '06:45',
            ogle: '13:20',
            ikindi: '16:45',
            aksam: '19:50',
            yatsi: '21:15',
          },
        },
        {
          date: '2026-03-30',
          times: {
            imsak: '04:58',
            gunes: '06:42',
            ogle: '13:20',
            ikindi: '16:46',
            aksam: '19:52',
            yatsi: '21:18',
          },
        },
      ],
    });

    const next = getNextPrayer(cache, { ...baseLocation, timezone: 'Europe/Berlin' }, Date.parse('2026-03-28T22:30:00.000Z'));

    expect(next?.dateIso).toBe('2026-03-29');
    expect(next?.key).toBe('imsak');
    expect(next?.time).toBe('05:00');
  });

  it('skips malformed time strings without throwing', () => {
    const cache = makeCache({
      entries: [
        {
          date: '2026-05-27',
          times: {
            imsak: 'bad-time',
            gunes: '05:35',
            ogle: '13:05',
            ikindi: '17:00',
            aksam: '20:25',
            yatsi: '21:55',
          },
        },
      ],
    });

    const next = getNextPrayer(cache, baseLocation, Date.parse('2026-05-27T01:00:00.000Z'));

    expect(next?.key).toBe('gunes');
    expect(next?.time).toBe('05:35');
  });
});
