import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import appJson from '../../app.json';

import {
  cancelAllPrayerNotifications,
  computeTargets,
  ensureAndroidChannel,
  reconcile,
  resetAllScheduledNotifications,
} from '../notificationScheduler';
import type { PrayerTime, YearlyPrayerCache } from '../types';

import {
  ANDROID_CHANNEL_ID,
  ANDROID_CHANNEL_NOTIFICATION_ID,
  PENDING_NOTIFICATION_HARD_CAP,
  REMINDER_WINDOW_DAYS,
  buildNotificationId,
  isPrayerNotificationId,
} from '@/constants/notifications';
import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { useUiStore } from '@/store/uiStore';

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

describe('notification identity', () => {
  it('scopes notification identifiers by timezone', () => {
    expect(buildNotificationId('9541', '2026-05-27', 'imsak', 'Europe/Istanbul')).not.toBe(
      buildNotificationId('9541', '2026-05-27', 'imsak', 'America/New_York'),
    );
  });

  it('gives reminder ids a distinct -reminder infix but still matches isPrayerNotificationId', () => {
    const adhan = buildNotificationId(
      '9541',
      '2026-05-27',
      'imsak',
      'Europe/Istanbul',
      '2026-05-27T02:54:00.000Z',
    );
    const reminder = buildNotificationId(
      '9541',
      '2026-05-27',
      'imsak',
      'Europe/Istanbul',
      '2026-05-27T02:44:00.000Z',
      'reminder',
    );
    expect(reminder).toContain('prayer-reminder-');
    expect(reminder).not.toBe(adhan);
    expect(isPrayerNotificationId(reminder)).toBe(true);
  });
});

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

async function withAndroid<T>(fn: () => T | Promise<T>): Promise<T> {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
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

describe('computeTargets — pre-prayer reminders', () => {
  // 00:00Z = 02:00 Berlin CEST on 2026-05-01 → all of 05-01's prayers are future.
  const now = new Date('2026-05-01T00:00:00Z');
  const cache = makeCache(range('2026-05-01', 12));

  it('emits no reminders when reminderMinutes=0', () => {
    const targets = computeTargets(cache, TZ, now, 8, [...PRAYER_KEYS], 0);
    expect(targets.every((t) => t.kind !== 'reminder')).toBe(true);
  });

  it('stays within the iOS hard cap and never drops an adhan (6 prayers, rm=10)', () => {
    const targets = computeTargets(cache, TZ, now, 8, [...PRAYER_KEYS], 10).slice(
      0,
      PENDING_NOTIFICATION_HARD_CAP,
    );
    expect(targets.length).toBeLessThanOrEqual(PENDING_NOTIFICATION_HARD_CAP);
    const adhans = targets.filter((t) => t.kind !== 'reminder');
    // 8-day window × 6 prayers = 48 adhans, all present (reminders are appended after).
    expect(adhans).toHaveLength(48);
  });

  it('schedules each reminder exactly reminderMinutes before its adhan', () => {
    const targets = computeTargets(cache, TZ, now, 8, [...PRAYER_KEYS], 10);
    const adhan = targets.find(
      (t) => t.kind !== 'reminder' && t.dateIso === '2026-05-01' && t.prayerKey === 'ogle',
    )!;
    const reminder = targets.find(
      (t) => t.kind === 'reminder' && t.dateIso === '2026-05-01' && t.prayerKey === 'ogle',
    )!;
    expect(reminder.kind).toBe('reminder');
    expect(reminder.reminderMinutes).toBe(10);
    expect(adhan.fireAt.getTime() - reminder.fireAt.getTime()).toBe(10 * 60_000);
  });

  it('limits reminders to the nearest REMINDER_WINDOW_DAYS days', () => {
    const targets = computeTargets(cache, TZ, now, 8, [...PRAYER_KEYS], 10);
    const reminderDates = new Set(
      targets.filter((t) => t.kind === 'reminder').map((t) => t.dateIso),
    );
    expect(reminderDates.size).toBeLessThanOrEqual(REMINDER_WINDOW_DAYS);
    expect(reminderDates.size).toBeGreaterThan(0);
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

  it('surfaces a parse-skipped banner when fewer than 80% of parseable values survive', async () => {
    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
    jest.useFakeTimers().setSystemTime(new Date('2026-05-02T00:00:00Z'));
    schedule.mockReset().mockResolvedValue('id');
    getAll.mockReset().mockResolvedValue([]);
    useUiStore.setState({ lastError: null });

    try {
      const allBad: PrayerTime = {
        date: '2026-05-02T00:00:00.000Z',
        times: {
          imsak: 'xx:yy',
          gunes: 'bad',
          ogle: 'noon',
          ikindi: '25:99',
          aksam: '##:##',
          yatsi: '???',
        },
      };
      await reconcile(makeCache([allBad]), {
        enabledPrayers: [...PRAYER_KEYS],
        windowDays: 1,
      });

      const err = useUiStore.getState().lastError;
      expect(err?.code).toBe('parse-skipped');
      expect(err?.data).toMatchObject({ skipped: 6, total: 6 });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('reconcile — F2 partial schedule isolation', () => {
  const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
  const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
  const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

  // Pin "now" so the rolling-window math is deterministic across test runs.
  const FAKE_NOW = new Date('2026-05-02T00:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FAKE_NOW);
    schedule.mockReset().mockResolvedValue('id');
    cancel.mockReset().mockResolvedValue(undefined);
    getAll.mockReset().mockResolvedValue([]);
    useUiStore.setState({ lastError: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildFutureCache(): YearlyPrayerCache {
    // At 02:00 Berlin on 2026-05-02 every prayer (earliest is imsak 05:00) is
    // still in the future, so the rolling window yields exactly 5 × 10 = 50.
    return makeCache(range('2026-05-02', 12));
  }

  it('continues scheduling remaining targets when one schedule call rejects', async () => {
    const cache = buildFutureCache();
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];

    let calls = 0;
    schedule.mockImplementation(() => {
      calls++;
      return calls === 7 ? Promise.reject(new Error('boom')) : Promise.resolve('ok');
    });

    const result = await reconcile(cache, { enabledPrayers: enabled });

    expect(result.total).toBe(50);
    expect(result.failed).toBe(1);
    expect(result.scheduled).toBe(49);
    expect(schedule).toHaveBeenCalledTimes(50);
  });

  it('writes a partial-schedule error to useUiStore when at least one schedule fails', async () => {
    const cache = buildFutureCache();
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];

    schedule.mockRejectedValueOnce(new Error('boom'));

    await reconcile(cache, { enabledPrayers: enabled });

    const err = useUiStore.getState().lastError;
    expect(err).not.toBeNull();
    expect(err?.code).toBe('partial-schedule');
    expect(err?.data?.failed).toBe(1);
    expect(err?.data?.total).toBe(50);
  });

  it('does NOT set a partial-schedule error when every target schedules successfully', async () => {
    const cache = buildFutureCache();
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
    useUiStore.setState({ lastError: { code: 'stale' } });

    const result = await reconcile(cache, { enabledPrayers: enabled });

    expect(result.failed).toBe(0);
    expect(result.scheduled).toBe(50);
    // Pre-existing error is left alone — we only set on failure.
    expect(useUiStore.getState().lastError?.code).toBe('stale');
  });

  it('clears a stale partial-schedule banner after a fully successful reconcile', async () => {
    const cache = buildFutureCache();
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
    useUiStore.setState({ lastError: { code: 'partial-schedule' } });

    const result = await reconcile(cache, { enabledPrayers: enabled });

    expect(result.failed).toBe(0);
    expect(useUiStore.getState().lastError).toBeNull();
  });

  it('does not clear unrelated UI errors after a fully successful reconcile', async () => {
    const cache = buildFutureCache();
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
    useUiStore.setState({ lastError: { code: 'sync-failed' } });

    const result = await reconcile(cache, { enabledPrayers: enabled });

    expect(result.failed).toBe(0);
    expect(useUiStore.getState().lastError?.code).toBe('sync-failed');
  });
});

describe('V2 — iOS pending limit hard cap (≤ 50 notifications)', () => {
  const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
  const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
  const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

  const FAKE_NOW = new Date('2026-05-02T00:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FAKE_NOW);
    schedule.mockReset().mockResolvedValue('id');
    cancel.mockReset().mockResolvedValue(undefined);
    getAll.mockReset().mockResolvedValue([]);
    useUiStore.setState({ lastError: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function freshCache(): YearlyPrayerCache {
    return makeCache(range('2026-05-02', 14));
  }

  it('reconcile auto-shrinks the window to 8 days when all 6 prayers are enabled', async () => {
    // 6 prayers × 10 default days would be 60 notifications, busting the iOS
    // 64-pending cap once other system notifications share the queue.
    const result = await reconcile(freshCache(), { enabledPrayers: [...PRAYER_KEYS] });

    // Primary invariant: never exceed the iOS pending-queue cap. The exact 48
    // is an incidental derivation (6 × ROLLING_WINDOW_DAYS_ALL_PRAYERS); a
    // future tweak to that constant must still keep the total under the cap.
    expect(result.scheduled).toBeLessThanOrEqual(PENDING_NOTIFICATION_HARD_CAP);
    expect(result.scheduled).toBe(48); // secondary anchor: 6 × 8 today
    expect(result.total).toBe(48);
    expect(schedule).toHaveBeenCalledTimes(48);
  });

  it('reconcile keeps the full 50 when only 5 prayers are enabled', async () => {
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];

    const result = await reconcile(freshCache(), { enabledPrayers: enabled });

    expect(result.scheduled).toBe(50);
    expect(result.total).toBe(50);
  });

  it('schedules reminder notifications tagged with kind=reminder in their data payload', async () => {
    await reconcile(freshCache(), { enabledPrayers: [...PRAYER_KEYS], reminderMinutes: 10 });
    const reminderCall = schedule.mock.calls.find(
      ([arg]) => typeof arg?.identifier === 'string' && arg.identifier.includes('prayer-reminder-'),
    );
    expect(reminderCall).toBeDefined();
    expect(reminderCall![0].content.data).toMatchObject({ kind: 'reminder' });
  });

  function countCalls(predicate: (id: string) => boolean): number {
    return schedule.mock.calls.filter(
      ([arg]) => typeof arg?.identifier === 'string' && predicate(arg.identifier),
    ).length;
  }

  it('still delivers reminders when 5 prayers would otherwise fill the whole cap', async () => {
    // 5 prayers × 10-day default window = 50 adhans = the entire cap. Without a
    // reminder budget the slice(0,50) drops every reminder. The window must
    // shrink so reminders survive (adhans stay first-priority, never dropped).
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
    const result = await reconcile(freshCache(), { enabledPrayers: enabled, reminderMinutes: 10 });

    expect(result.total).toBeLessThanOrEqual(PENDING_NOTIFICATION_HARD_CAP);
    expect(result.failed).toBe(0);
    expect(countCalls((id) => id.includes('prayer-reminder-'))).toBeGreaterThan(0);
    // Adhans for the nearest REMINDER_WINDOW_DAYS must all still be present.
    expect(countCalls((id) => !id.includes('prayer-reminder-'))).toBeGreaterThanOrEqual(
      enabled.length * REMINDER_WINDOW_DAYS,
    );
  });

  it('delivers a full reminder set for all 6 prayers without dropping any adhan', async () => {
    const result = await reconcile(freshCache(), {
      enabledPrayers: [...PRAYER_KEYS],
      reminderMinutes: 10,
    });
    expect(result.total).toBeLessThanOrEqual(PENDING_NOTIFICATION_HARD_CAP);
    // All 6 prayers × REMINDER_WINDOW_DAYS reminders survive the budget.
    expect(countCalls((id) => id.includes('prayer-reminder-'))).toBe(
      PRAYER_KEYS.length * REMINDER_WINDOW_DAYS,
    );
  });

  it('serializes Android schedule mutations within one reconcile so native notification work is not flooded', async () => {
    await withAndroid(async () => {
      const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
      let activeSchedules = 0;
      let sawOverlap = false;
      schedule.mockImplementation(async () => {
        activeSchedules += 1;
        if (activeSchedules > 1) {
          sawOverlap = true;
          activeSchedules -= 1;
          throw new Error('native schedule overlap');
        }
        await Promise.resolve();
        activeSchedules -= 1;
        return 'id';
      });

      const result = await reconcile(freshCache(), { enabledPrayers: enabled });

      expect(sawOverlap).toBe(false);
      expect(result.failed).toBe(0);
      expect(result.scheduled).toBe(50);
      expect(useUiStore.getState().lastError).toBeNull();
    });
  });

  it('serializes Android cancel mutations within one reconcile so native notification work is not flooded', async () => {
    await withAndroid(async () => {
      const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
      const stalePending = [
        { identifier: 'prayer-9541-2026-04-30-imsak' },
        { identifier: 'prayer-9541-2026-04-30-gunes' },
        { identifier: 'prayer-9541-2026-04-30-ogle' },
      ];
      let activeCancels = 0;
      let sawOverlap = false;
      getAll.mockResolvedValueOnce(stalePending);
      cancel.mockImplementation(async () => {
        activeCancels += 1;
        if (activeCancels > 1) {
          sawOverlap = true;
          activeCancels -= 1;
          throw new Error('native cancel overlap');
        }
        await Promise.resolve();
        activeCancels -= 1;
      });

      const result = await reconcile(freshCache(), { enabledPrayers: enabled });

      expect(sawOverlap).toBe(false);
      expect(cancel).toHaveBeenCalledTimes(3);
      expect(result.failed).toBe(0);
      expect(result.scheduled).toBe(50);
      expect(useUiStore.getState().lastError).toBeNull();
    });
  });

  it('reconcile honors an explicit windowDays override (no auto-shrink)', async () => {
    // Caller is responsible — if they ask for 10 days × 6 prayers explicitly
    // they get 60 targets only IF the hard cap allows; the 50 cap still wins.
    const result = await reconcile(freshCache(), {
      enabledPrayers: [...PRAYER_KEYS],
      windowDays: 10,
    });

    // 10 × 6 = 60 raw, but the 50-cap clamps it.
    expect(result.scheduled).toBe(50);
    expect(result.total).toBe(50);
  });

  it('cancel pass survives a single rejection and still schedules new targets', async () => {
    // Mirrors the F2 schedule-pass contract: a native crash mid-cancel of a
    // stale notification must not block the new schedule pass below.
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
    const stalePending = [
      { identifier: 'prayer-9541-2026-04-30-imsak' }, // not in fresh window
      { identifier: 'prayer-9541-2026-04-30-gunes' },
      { identifier: 'prayer-9541-2026-04-30-ogle' },
    ];
    getAll.mockResolvedValueOnce(stalePending);
    let cancelCount = 0;
    cancel.mockImplementation(async () => {
      cancelCount++;
      if (cancelCount === 2) throw new Error('native-cancel-crash');
    });

    const result = await reconcile(freshCache(), {
      enabledPrayers: enabled,
      windowDays: 10,
    });

    // All 3 stale ids attempted (not aborted on the rejection).
    expect(cancel).toHaveBeenCalledTimes(3);
    // Schedule pass still ran for all 50 fresh targets.
    expect(result.scheduled).toBe(50);
    expect(schedule).toHaveBeenCalledTimes(50);
    // partial-schedule banner reports the cancel-side failure too — without
    // the data field, a future refactor could drop cancelFailed from the OR
    // and the user would silently miss the cancel-side signal.
    const err = useUiStore.getState().lastError;
    expect(err?.code).toBe('partial-schedule');
    expect(err?.data?.failed).toBe(0);
    expect(err?.data?.cancelFailed).toBe(1);
  });

  it('reconcile clamps a manipulated 70-target list down to 50', async () => {
    // Long cache + future dates so a wide windowDays produces > 50 raw targets.
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];
    const result = await reconcile(makeCache(range('2026-05-02', 20)), {
      enabledPrayers: enabled,
      windowDays: 14, // 14 × 5 = 70 raw
    });

    expect(result.total).toBe(50);
    expect(result.scheduled).toBe(50);
    expect(schedule).toHaveBeenCalledTimes(50);
  });
});

describe('notification sound + Android channel routing', () => {
  const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
  const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
  const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
  const setChannel = Notifications.setNotificationChannelAsync as jest.Mock;
  const deleteChannel = Notifications.deleteNotificationChannelAsync as jest.Mock;

  const FAKE_NOW = new Date('2026-05-02T00:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FAKE_NOW);
    schedule.mockReset().mockResolvedValue('id');
    cancel.mockReset().mockResolvedValue(undefined);
    getAll.mockReset().mockResolvedValue([]);
    setChannel.mockReset().mockResolvedValue(undefined);
    deleteChannel.mockReset().mockResolvedValue(undefined);
    useUiStore.setState({ lastError: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function singleTargetCache(): YearlyPrayerCache {
    // Tomorrow's imsak only — minimal cache to capture a single schedule call.
    return makeCache([entry('2026-05-03', { imsak: '05:00' })]);
  }

  it('uses the custom notification sound for every prayer when the preference is notification', async () => {
    const cache = singleTargetCache();
    await reconcile(cache, {
      enabledPrayers: ['imsak'],
      sound: 'notification',
      windowDays: 2,
    });

    const calls = schedule.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].content.sound).toBe('notification.wav');
  });

  it('uses the default sound for every prayer when the preference is default', async () => {
    const cache = singleTargetCache();
    await reconcile(cache, {
      enabledPrayers: ['imsak', 'ogle'],
      sound: 'default',
      windowDays: 2,
    });

    expect(schedule.mock.calls.length).toBeGreaterThan(0);
    for (const call of schedule.mock.calls) {
      expect(call[0].content.sound).toBe('default');
    }
  });

  it('routes Android schedules to the custom-sound channel under the notification preference', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      const cache = makeCache([entry('2026-05-03', { gunes: '06:30' })]);
      await reconcile(cache, {
        enabledPrayers: ['gunes'],
        sound: 'notification',
        windowDays: 2,
      });
      expect(schedule.mock.calls[0][0].trigger.channelId).toBe(ANDROID_CHANNEL_NOTIFICATION_ID);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });

  it('routes Android schedules to the default channel when the preference is default', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      const cache = singleTargetCache();
      await reconcile(cache, {
        enabledPrayers: ['imsak'],
        sound: 'default',
        windowDays: 2,
      });
      expect(schedule.mock.calls[0][0].trigger.channelId).toBe(ANDROID_CHANNEL_ID);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });

  it('ensureAndroidChannel creates exactly the default + custom-sound channels (and deletes the legacy recitation channels)', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await ensureAndroidChannel();
      const channelIds = setChannel.mock.calls.map((c) => c[0]);
      // Exactly the two current channels — no stale adhan-fajr/adhan-regular.
      expect(channelIds).toEqual([ANDROID_CHANNEL_ID, ANDROID_CHANNEL_NOTIFICATION_ID]);
      const customCall = setChannel.mock.calls.find(
        (c) => c[0] === ANDROID_CHANNEL_NOTIFICATION_ID,
      );
      expect(customCall?.[1].sound).toBe('notification.wav');
      // Legacy recitation channels from the pre-pivot build are cleaned up.
      const deleted = deleteChannel.mock.calls.map((c) => c[0]);
      expect(deleted).toContain('adhan-fajr');
      expect(deleted).toContain('adhan-regular');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });

  it('declares the custom notification sound asset in the Expo notifications plugin', () => {
    const notificationsPlugin = appJson.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications',
    );
    const config = Array.isArray(notificationsPlugin)
      ? (notificationsPlugin[1] as { sounds?: string[] })
      : null;
    expect(config?.sounds).toContain('./assets/sounds/notification.wav');
  });

  // Regression guard: the deleted adhan-player module's manifest used to supply
  // these app-wide, so expo-notifications got EXACT alarms. Without them, Android
  // 12+ (canScheduleExactAlarms()===false) silently downgrades every prayer alarm
  // to INEXACT (10+ min late) — religiously wrong (rules/11). expo-notifications
  // is mocked in jest so only this config assertion can catch the regression.
  it('declares exact-alarm permissions so Android 12+ fires prayer alarms EXACTLY', () => {
    const perms = appJson.expo.android.permissions;
    expect(perms).toContain('USE_EXACT_ALARM');
    expect(perms).toContain('SCHEDULE_EXACT_ALARM');
  });
});

describe('cancelAllPrayerNotifications', () => {
  const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
  const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

  beforeEach(() => {
    getAll.mockReset();
    cancel.mockReset().mockResolvedValue(undefined);
  });

  it('cancels every enumerable prayer notification and leaves unrelated ones alone', async () => {
    getAll.mockResolvedValue([
      { identifier: buildNotificationId('9541', '2026-05-03', 'imsak', 'tz') },
      { identifier: 'unrelated-id' },
    ]);
    await cancelAllPrayerNotifications();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('resetAllScheduledNotifications — enumeration-independent hard reset', () => {
  const cancelAllExpo = Notifications.cancelAllScheduledNotificationsAsync as jest.Mock;
  const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

  beforeEach(() => {
    cancelAllExpo.mockReset().mockResolvedValue(undefined);
    getAll.mockReset().mockResolvedValue([]);
  });

  // The whole point of the hard reset: clear every pending notification WITHOUT
  // enumerating, so a previous city can't survive a getAll()/id-recognition gap.
  it('cancels all scheduled notifications without enumerating', async () => {
    await resetAllScheduledNotifications();

    expect(cancelAllExpo).toHaveBeenCalledTimes(1);
    expect(getAll).not.toHaveBeenCalled();
  });
});

describe('reconcile — serialization guard (overlapping passes must not interleave)', () => {
  const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
  const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
  const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-02T00:00:00Z'));
    schedule.mockReset().mockResolvedValue('id');
    cancel.mockReset().mockResolvedValue(undefined);
    getAll.mockReset().mockResolvedValue([]);
    useUiStore.setState({ lastError: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('chains a second reconcile behind the first instead of interleaving their store access', async () => {
    const cache = makeCache(range('2026-05-02', 12));
    const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];

    // getAll is entered exactly once per pass, right before the cancel/schedule
    // diff. Park the FIRST pass there; a serialized second pass must not have
    // entered getAll yet (it is chained behind the first, not running in parallel).
    let getAllCalls = 0;
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    getAll.mockImplementation(async () => {
      getAllCalls += 1;
      if (getAllCalls === 1) await firstGate;
      return [];
    });

    const r1 = reconcile(cache, { enabledPrayers: enabled });
    const r2 = reconcile(cache, { enabledPrayers: enabled });

    // Flush microtasks: the first pass is parked inside its single getAll; a
    // serialized second pass has not started, so getAll was entered exactly once.
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    expect(getAllCalls).toBe(1);

    releaseFirst();
    await Promise.all([r1, r2]);

    // Both passes ran one-after-the-other — never concurrently — and no spurious
    // partial-schedule banner was raised by interleaving.
    expect(getAllCalls).toBe(2);
    expect(useUiStore.getState().lastError).toBeNull();
  });
});

describe('scheduleOne — Android uses DATE trigger (CALENDAR is iOS-only)', () => {
  const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
  const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-02T00:00:00Z'));
    schedule.mockReset().mockResolvedValue('id');
    getAll.mockReset().mockResolvedValue([]);
    useUiStore.setState({ lastError: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function onPlatform<T>(os: 'android' | 'ios', fn: () => Promise<T>): Promise<T> {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    try {
      return await fn();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  }

  it('uses a DATE trigger with an absolute epoch on Android (not the unsupported CALENDAR)', async () => {
    await onPlatform('android', async () => {
      const cache = makeCache([entry('2026-05-03', { ogle: '12:00' })]);
      await reconcile(cache, { enabledPrayers: ['ogle'], windowDays: 2 });

      expect(schedule).toHaveBeenCalledTimes(1);
      const trigger = schedule.mock.calls[0][0].trigger;
      expect(trigger.type).toBe('date'); // CALENDAR is rejected by the Android native scheduler
      expect(typeof trigger.date).toBe('number'); // absolute ms instant (DST-correct via fireAt)
      expect(trigger.channelId).toBeDefined(); // channel routing preserved
    });
  });

  it('keeps the CALENDAR trigger on iOS', async () => {
    await onPlatform('ios', async () => {
      const cache = makeCache([entry('2026-05-03', { ogle: '12:00' })]);
      await reconcile(cache, { enabledPrayers: ['ogle'], windowDays: 2 });

      const trigger = schedule.mock.calls[0][0].trigger;
      expect(trigger.type).toBe('calendar');
      expect(trigger.timezone).toBeDefined();
    });
  });
});

describe('reconcile — forceReschedule (force-stop / OEM-kill self-heal)', () => {
  const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
  const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
  const getAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

  const FAKE_NOW = new Date('2026-05-02T00:00:00Z');
  const enabled: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam'];

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FAKE_NOW);
    schedule.mockReset().mockResolvedValue('id');
    cancel.mockReset().mockResolvedValue(undefined);
    getAll.mockReset().mockResolvedValue([]);
    useUiStore.setState({ lastError: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function futureCache(): YearlyPrayerCache {
    return makeCache(range('2026-05-02', 12));
  }

  // After a force-stop, Android cancels the app's AlarmManager alarms but
  // expo-notifications' SharedPreferences store persists, so a normal diff
  // reconcile sees every target as "already pending" and re-registers NOTHING
  // (alarms stay dead). forceReschedule re-registers every target regardless,
  // overwriting the stale records and restoring the real alarms.
  it('re-schedules EVERY target even when all are already pending', async () => {
    const cache = futureCache();
    const pending = computeTargets(cache, TZ, FAKE_NOW, 10, enabled).map((s) => ({
      identifier: s.id,
    }));
    getAll.mockResolvedValue(pending);

    const result = await reconcile(cache, { enabledPrayers: enabled, forceReschedule: true });

    expect(schedule).toHaveBeenCalledTimes(50);
    expect(result.scheduled).toBe(50);
  });

  it('without forceReschedule, still skips already-pending targets (no-op diff)', async () => {
    const cache = futureCache();
    const pending = computeTargets(cache, TZ, FAKE_NOW, 10, enabled).map((s) => ({
      identifier: s.id,
    }));
    getAll.mockResolvedValue(pending);

    const result = await reconcile(cache, { enabledPrayers: enabled });

    expect(schedule).toHaveBeenCalledTimes(0);
    expect(result.scheduled).toBe(0);
  });
});
