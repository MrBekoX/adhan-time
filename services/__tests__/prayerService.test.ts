import { ezanvakti } from '../ezanvaktiClient';
import { syncYearly } from '../prayerService';
import type { PrayerTime, YearlyPrayerCache } from '../types';

import { PRAYER_CACHE_TTL_MS } from '@/constants/api';
import { usePrayerStore } from '@/store/prayerStore';

jest.mock('../ezanvaktiClient', () => ({
  ezanvakti: {
    prayerTimesYearly: jest.fn(),
    prayerTimesRange: jest.fn(),
  },
}));

jest.mock('../notificationScheduler', () => ({
  ensureAndroidChannel: jest.fn(),
  reconcile: jest.fn(async () => ({ scheduled: 0, cancelled: 0, total: 0 })),
}));

const yearlyMock = ezanvakti.prayerTimesYearly as jest.Mock;
const rangeMock = ezanvakti.prayerTimesRange as jest.Mock;

function entry(date: string): PrayerTime {
  return {
    date: `${date}T00:00:00.000Z`,
    times: {
      imsak: '05:00',
      gunes: '06:30',
      ogle: '12:00',
      ikindi: '15:30',
      aksam: '18:00',
      yatsi: '19:30',
    },
  };
}

function range(start: string, days: number): PrayerTime[] {
  const out: PrayerTime[] = [];
  const d = new Date(`${start}T00:00:00.000Z`);
  for (let i = 0; i < days; i++) {
    const iso = d.toISOString().slice(0, 10);
    out.push(entry(iso));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const TZ = 'Europe/Istanbul';
const DISTRICT = '9541';
const NAME = 'Istanbul';

beforeEach(() => {
  yearlyMock.mockReset();
  rangeMock.mockReset();
  usePrayerStore.setState({ cache: null });
  jest.useRealTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

describe('syncYearly year-boundary behavior', () => {
  it('uses cache when rolling window stays within cached year and TTL is fresh', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    const cached: YearlyPrayerCache = {
      districtId: DISTRICT,
      year: 2026,
      timezone: TZ,
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      entries: range('2026-01-01', 365),
    };
    usePrayerStore.setState({ cache: cached });

    await syncYearly(DISTRICT, NAME, TZ);

    expect(yearlyMock).not.toHaveBeenCalled();
    expect(rangeMock).not.toHaveBeenCalled();
  });

  it('refreshes when last cached entry is before rolling-window end', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-25T12:00:00Z'));
    const cached: YearlyPrayerCache = {
      districtId: DISTRICT,
      year: 2026,
      timezone: TZ,
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      entries: range('2026-12-15', 17), // last entry 2026-12-31, rolling end = 2027-01-04
    };
    usePrayerStore.setState({ cache: cached });
    yearlyMock.mockResolvedValueOnce(range('2026-01-01', 365));
    rangeMock.mockResolvedValueOnce(range('2027-01-01', 15));

    await syncYearly(DISTRICT, NAME, TZ);

    expect(yearlyMock).toHaveBeenCalledWith(DISTRICT);
    expect(rangeMock).toHaveBeenCalledWith(DISTRICT, '2027-01-01', '2027-01-15');
    const persisted = usePrayerStore.getState().cache;
    expect(persisted?.entries.length).toBe(365 + 15);
    expect(persisted?.year).toBe(2026);
  });

  it('uses local-year (not UTC year) for cache validity in Asia/Tokyo', async () => {
    // 2026-12-31 22:00 UTC == 2027-01-01 07:00 Asia/Tokyo
    jest.useFakeTimers().setSystemTime(new Date('2026-12-31T22:00:00Z'));
    const cached: YearlyPrayerCache = {
      districtId: DISTRICT,
      year: 2026,
      timezone: 'Asia/Tokyo',
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      entries: range('2026-12-01', 31),
    };
    usePrayerStore.setState({ cache: cached });
    yearlyMock.mockResolvedValueOnce(range('2027-01-01', 365));

    await syncYearly(DISTRICT, NAME, 'Asia/Tokyo');

    // Cache year (2026) doesn't match local year (2027) → must refetch.
    expect(yearlyMock).toHaveBeenCalledWith(DISTRICT);
    expect(usePrayerStore.getState().cache?.year).toBe(2027);
  });

  it('refetches when timezone changes even if year and TTL are valid', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    const cached: YearlyPrayerCache = {
      districtId: DISTRICT,
      year: 2026,
      timezone: 'Asia/Tokyo',
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      entries: range('2026-01-01', 365),
    };
    usePrayerStore.setState({ cache: cached });
    yearlyMock.mockResolvedValueOnce(range('2026-01-01', 365));

    await syncYearly(DISTRICT, NAME, 'Europe/Istanbul');

    expect(yearlyMock).toHaveBeenCalledTimes(1);
  });

  it('refetches when TTL expires', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    const cached: YearlyPrayerCache = {
      districtId: DISTRICT,
      year: 2026,
      timezone: TZ,
      fetchedAt: new Date(Date.now() - PRAYER_CACHE_TTL_MS - 1).toISOString(),
      entries: range('2026-01-01', 365),
    };
    usePrayerStore.setState({ cache: cached });
    yearlyMock.mockResolvedValueOnce(range('2026-01-01', 365));

    await syncYearly(DISTRICT, NAME, TZ);

    expect(yearlyMock).toHaveBeenCalledTimes(1);
  });

  it('does not call prayerTimesRange when rolling window stays inside the same year', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    usePrayerStore.setState({ cache: null });
    yearlyMock.mockResolvedValueOnce(range('2026-01-01', 365));

    await syncYearly(DISTRICT, NAME, TZ);

    expect(yearlyMock).toHaveBeenCalledTimes(1);
    expect(rangeMock).not.toHaveBeenCalled();
  });

  it('force=true triggers refetch even when cache would be valid', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    const cached: YearlyPrayerCache = {
      districtId: DISTRICT,
      year: 2026,
      timezone: TZ,
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      entries: range('2026-01-01', 365),
    };
    usePrayerStore.setState({ cache: cached });
    yearlyMock.mockResolvedValueOnce(range('2026-01-01', 365));

    await syncYearly(DISTRICT, NAME, TZ, { force: true });

    expect(yearlyMock).toHaveBeenCalledTimes(1);
  });
});
