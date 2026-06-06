import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { AppState } from 'react-native';
import TestRenderer from 'react-test-renderer';

import { detectPrayerCrossing, useForegroundPrayerAlert } from '../useForegroundPrayerAlert';

import type { PrayerKey } from '@/constants/prayers';
import { playForegroundChime } from '@/services/foregroundChime';
import type { PrayerTime, YearlyPrayerCache } from '@/services/types';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { parsePrayerTime } from '@/utils/time';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('@/services/foregroundChime', () => ({
  playForegroundChime: jest.fn(async () => undefined),
}));

const TZ = 'Europe/Berlin';
const DATE = '2026-05-02';

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

const cache: YearlyPrayerCache = {
  districtId: '9541',
  year: 2026,
  fetchedAt: '2026-05-01T00:00:00.000Z',
  timezone: TZ,
  entries: [entry(DATE), entry('2026-05-03')],
};

const location = { districtId: '9541', timezone: TZ };
const ALL: PrayerKey[] = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'];

function fireOf(time: string): number {
  return parsePrayerTime(time, DATE, TZ).getTime();
}

describe('detectPrayerCrossing', () => {
  it('detects an enabled prayer whose fireAt falls within (from, to]', () => {
    const fire = fireOf('18:00'); // aksam
    expect(detectPrayerCrossing(cache, location, ALL, fire - 1000, fire)).toBe('aksam');
  });

  it('returns null when the window ends before the prayer fires', () => {
    const fire = fireOf('18:00');
    expect(detectPrayerCrossing(cache, location, ALL, fire - 2000, fire - 1000)).toBeNull();
  });

  it('ignores a prayer that is not in the enabled set', () => {
    const fire = fireOf('18:00'); // aksam
    expect(detectPrayerCrossing(cache, location, ['yatsi'], fire - 1000, fire)).toBeNull();
  });

  it('excludes the lower bound so a prayer is not re-alerted on the next tick', () => {
    const fire = fireOf('18:00');
    // fireAt === from → already handled by the previous tick → not again.
    expect(detectPrayerCrossing(cache, location, ALL, fire, fire + 1000)).toBeNull();
  });

  it('returns null for a non-positive window', () => {
    expect(detectPrayerCrossing(cache, location, ALL, 1000, 1000)).toBeNull();
    expect(detectPrayerCrossing(cache, location, ALL, 2000, 1000)).toBeNull();
  });

  it('returns null without cache or location', () => {
    const fire = fireOf('18:00');
    expect(detectPrayerCrossing(null, location, ALL, fire - 1000, fire)).toBeNull();
    expect(detectPrayerCrossing(cache, null, ALL, fire - 1000, fire)).toBeNull();
  });

  it('does not fire when the cache belongs to a different location', () => {
    const fire = fireOf('18:00');
    const other = { districtId: '0000', timezone: TZ };
    expect(detectPrayerCrossing(cache, other, ALL, fire - 1000, fire)).toBeNull();
  });
});

describe('useForegroundPrayerAlert (hook)', () => {
  let captured: ReturnType<typeof useForegroundPrayerAlert> | undefined;
  function Probe(): null {
    captured = useForegroundPrayerAlert();
    return null;
  }

  function setAppState(value: string): void {
    Object.defineProperty(AppState, 'currentState', { value, writable: true, configurable: true });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    captured = undefined;
    (Haptics.notificationAsync as jest.Mock).mockClear();
    (playForegroundChime as jest.Mock).mockClear();
    usePrayerStore.setState({ cache });
    useLocationStore.setState({
      selected: {
        countryId: '2',
        countryName: 'TÜRKİYE',
        stateId: '1',
        stateName: 'Berlin',
        districtId: '9541',
        districtName: 'Berlin',
        timezone: TZ,
      },
    });
    useSettingsStore.setState({ enabledPrayers: ALL });
    setAppState('active');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('raises an alert + haptic + chime when an enabled prayer crosses while foreground', async () => {
    const fire = fireOf('18:00');
    jest.setSystemTime(fire - 500);
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });

    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(captured?.active).toBe('aksam');
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(playForegroundChime).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => tree?.unmount());
  });

  it('does NOT alert when the app is not active (background crossing → OS owns it)', async () => {
    const fire = fireOf('18:00');
    jest.setSystemTime(fire - 500);
    setAppState('background');
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });

    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(captured?.active).toBeNull();
    expect(playForegroundChime).not.toHaveBeenCalled();
    await TestRenderer.act(async () => tree?.unmount());
  });

  it('does NOT alert for an over-long tick window (JS loop suspended → OS already delivered)', async () => {
    const fire = fireOf('18:00');
    jest.setSystemTime(fire - 1000);
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });

    // Simulate the app being backgrounded across the prayer: the wall clock jumps
    // far past fireAt with no intermediate ticks, then one overdue tick runs.
    jest.setSystemTime(fire + 60_000);
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(captured?.active).toBeNull();
    await TestRenderer.act(async () => tree?.unmount());
  });

  it('dismiss() clears the active alert', async () => {
    const fire = fireOf('18:00');
    jest.setSystemTime(fire - 500);
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(captured?.active).toBe('aksam');

    await TestRenderer.act(async () => {
      captured?.dismiss();
    });

    expect(captured?.active).toBeNull();
    await TestRenderer.act(async () => tree?.unmount());
  });
});
