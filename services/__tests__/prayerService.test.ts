import { ezanvakti } from '../ezanvaktiClient';
import * as scheduler from '../notificationScheduler';
import { resetScheduleForLocation, scheduleAfterToggle, syncYearly } from '../prayerService';
import type { PrayerTime, YearlyPrayerCache } from '../types';

import { PRAYER_CACHE_TTL_MS } from '@/constants/api';
import { usePrayerStore } from '@/store/prayerStore';
import { useUiStore } from '@/store/uiStore';

jest.mock('../ezanvaktiClient', () => ({
  ezanvakti: {
    prayerTimesYearly: jest.fn(),
    prayerTimesRange: jest.fn(),
  },
}));

jest.mock('../notificationScheduler', () => ({
  ensureAndroidChannel: jest.fn(),
  reconcile: jest.fn(async () => ({ scheduled: 0, cancelled: 0, total: 0 })),
  cancelAllPrayerNotifications: jest.fn(async () => undefined),
  resetAllScheduledNotifications: jest.fn(async () => undefined),
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
  (scheduler.reconcile as jest.Mock).mockClear();
  (scheduler.cancelAllPrayerNotifications as jest.Mock).mockClear();
  (scheduler.resetAllScheduledNotifications as jest.Mock).mockClear();
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

  it("surfaces a 'partial-sync' banner (NOT sync-failed) when the next-year fetch throws", async () => {
    // The distinct code is load-bearing: useAppLifecycle clears stale
    // 'sync-failed' banners on a clean syncYearly, and would have wiped
    // this one if we used the same code.
    jest.useFakeTimers().setSystemTime(new Date('2026-12-25T12:00:00Z'));
    usePrayerStore.setState({ cache: null });
    useUiStore.setState({ lastError: null });
    yearlyMock.mockResolvedValueOnce(range('2026-01-01', 365));
    rangeMock.mockRejectedValueOnce(new Error('upstream-502'));

    await syncYearly(DISTRICT, NAME, TZ);

    expect(rangeMock).toHaveBeenCalled();
    expect(usePrayerStore.getState().cache?.entries.length).toBe(365);
    const err = useUiStore.getState().lastError;
    expect(err).not.toBeNull();
    expect(err?.code).toBe('partial-sync');
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

  it('rejects empty yearly prayer responses without caching or scheduling them', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    usePrayerStore.setState({ cache: null });
    yearlyMock.mockResolvedValueOnce([]);

    await expect(syncYearly(DISTRICT, NAME, TZ)).rejects.toThrow(/empty/i);

    expect(usePrayerStore.getState().cache).toBeNull();
    expect(scheduler.reconcile).not.toHaveBeenCalled();
  });
});

describe('scheduleAfterToggle (V4)', () => {
  const cancelMock = scheduler.cancelAllPrayerNotifications as jest.Mock;
  const reconcileMock = scheduler.reconcile as jest.Mock;

  beforeEach(() => {
    cancelMock.mockClear();
    reconcileMock.mockClear();
  });

  it('syncs successfully before cancelling existing notifications', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    usePrayerStore.setState({ cache: null });

    const order: string[] = [];
    yearlyMock.mockImplementationOnce(async () => {
      order.push('sync');
      return range('2026-01-01', 365);
    });
    cancelMock.mockImplementationOnce(async () => {
      order.push('cancel');
    });
    reconcileMock.mockImplementationOnce(async () => {
      order.push('reconcile');
      return { scheduled: 0, cancelled: 0, total: 0 };
    });

    await scheduleAfterToggle(DISTRICT, NAME, TZ);

    expect(order).toEqual(['sync', 'cancel', 'reconcile']);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(yearlyMock).toHaveBeenCalledTimes(1);
  });

  it('does not cancel existing notifications when the refresh fails', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    usePrayerStore.setState({ cache: null });
    yearlyMock.mockRejectedValueOnce(new Error('sync-boom'));

    await expect(scheduleAfterToggle(DISTRICT, NAME, TZ)).rejects.toThrow('sync-boom');

    expect(cancelMock).not.toHaveBeenCalled();
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it('propagates errors so caller can surface to UI', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    yearlyMock.mockResolvedValueOnce(range('2026-01-01', 365));
    cancelMock.mockRejectedValueOnce(new Error('cancel-boom'));

    await expect(scheduleAfterToggle(DISTRICT, NAME, TZ)).rejects.toThrow('cancel-boom');
  });
});

describe('resetScheduleForLocation — city switch hard reset (S4)', () => {
  const resetMock = scheduler.resetAllScheduledNotifications as jest.Mock;
  const reconcileMock = scheduler.reconcile as jest.Mock;

  beforeEach(() => {
    resetMock.mockClear();
    reconcileMock.mockClear();
    yearlyMock.mockReset();
    usePrayerStore.setState({ cache: null });
  });

  it('fetches the new city, hard-resets ALL notifications, then schedules — in that order', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    const order: string[] = [];
    yearlyMock.mockImplementationOnce(async () => {
      order.push('fetch');
      return range('2026-01-01', 365);
    });
    resetMock.mockImplementationOnce(async () => {
      order.push('reset');
    });
    reconcileMock.mockImplementationOnce(async () => {
      order.push('schedule');
      return { scheduled: 0, cancelled: 0, total: 0 };
    });

    await resetScheduleForLocation('9805', 'Gaziantep', 'Europe/Istanbul');

    // Reset MUST happen before scheduling the new city — otherwise the old
    // city survives (the whole bug).
    expect(order).toEqual(['fetch', 'reset', 'schedule']);
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT reset or schedule when the new-city fetch fails', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    yearlyMock.mockRejectedValueOnce(new Error('fetch-boom'));

    await expect(
      resetScheduleForLocation('9805', 'Gaziantep', 'Europe/Istanbul'),
    ).rejects.toThrow('fetch-boom');

    expect(resetMock).not.toHaveBeenCalled();
    expect(reconcileMock).not.toHaveBeenCalled();
  });
});

describe('syncYearly — forceReschedule (cold-start self-heal)', () => {
  const reconcileMock = scheduler.reconcile as jest.Mock;

  function validCache(): YearlyPrayerCache {
    return {
      districtId: DISTRICT,
      year: 2026,
      timezone: TZ,
      fetchedAt: new Date(Date.now() - 60_000).toISOString(),
      entries: range('2026-01-01', 365),
    };
  }

  beforeEach(() => {
    reconcileMock.mockClear();
  });

  it('forwards forceReschedule:true to reconcile when requested', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    usePrayerStore.setState({ cache: validCache() });

    await syncYearly(DISTRICT, NAME, TZ, { forceReschedule: true });

    expect(reconcileMock).toHaveBeenCalledTimes(1);
    expect(reconcileMock.mock.calls[0][1].forceReschedule).toBe(true);
  });

  it('does not force a reschedule on a normal sync', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00Z'));
    usePrayerStore.setState({ cache: validCache() });

    await syncYearly(DISTRICT, NAME, TZ);

    expect(reconcileMock).toHaveBeenCalledTimes(1);
    expect(reconcileMock.mock.calls[0][1].forceReschedule).toBeFalsy();
  });
});
