import * as Location from 'expo-location';
import * as React from 'react';
import TestRenderer from 'react-test-renderer';

import { logger } from '@/utils/logger';

import { useUserLocation, type LocationStatus } from '../useUserLocation';

jest.mock('expo-location', () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

const hasServicesEnabledAsyncMock = Location.hasServicesEnabledAsync as jest.Mock;
const requestForegroundPermissionsAsyncMock =
  Location.requestForegroundPermissionsAsync as jest.Mock;
const getCurrentPositionAsyncMock = Location.getCurrentPositionAsync as jest.Mock;
const getLastKnownPositionAsyncMock = Location.getLastKnownPositionAsync as jest.Mock;
const watchPositionAsyncMock = Location.watchPositionAsync as jest.Mock;

function makePosition(lat: number, lon: number, accuracyM: number): Location.LocationObject {
  return {
    coords: {
      accuracy: accuracyM,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: lat,
      longitude: lon,
      speed: null,
    },
    timestamp: Date.now(),
  };
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await TestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

function Probe({
  enabled,
  onStatus,
}: {
  enabled: boolean;
  onStatus: (status: LocationStatus) => void;
}): null {
  const status = useUserLocation({ enabled });
  React.useEffect(() => {
    onStatus(status);
  }, [onStatus, status]);
  return null;
}

describe('useUserLocation', () => {
  let tree: TestRenderer.ReactTestRenderer | null = null;
  let remove: jest.Mock;

  beforeEach(() => {
    remove = jest.fn();
    hasServicesEnabledAsyncMock.mockResolvedValue(true);
    requestForegroundPermissionsAsyncMock.mockResolvedValue({ status: 'granted' });
    getCurrentPositionAsyncMock.mockReturnValue(never<Location.LocationObject>());
    getLastKnownPositionAsyncMock.mockResolvedValue(null);
    watchPositionAsyncMock.mockResolvedValue({ remove });
  });

  afterEach(() => {
    TestRenderer.act(() => {
      tree?.unmount();
    });
    tree = null;
    jest.clearAllMocks();
  });

  it('publishes a recent last-known position while the fresh fix is still pending', async () => {
    getLastKnownPositionAsyncMock.mockResolvedValueOnce(makePosition(41.0082, 28.9784, 75));
    const statuses: LocationStatus[] = [];

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Probe enabled onStatus={(status) => statuses.push(status)} />,
      );
    });
    await flushAsyncWork();

    expect(statuses).toContainEqual({
      accuracyM: 75,
      kind: 'ready',
      lat: 41.0082,
      lon: 28.9784,
    });
  });

  it('publishes watch updates even when the one-shot current fix is still pending', async () => {
    let watchCallback: ((pos: Location.LocationObject) => void) | null = null;
    watchPositionAsyncMock.mockImplementationOnce((_options, callback) => {
      watchCallback = callback;
      return Promise.resolve({ remove });
    });
    const statuses: LocationStatus[] = [];

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Probe enabled onStatus={(status) => statuses.push(status)} />,
      );
    });
    await flushAsyncWork();

    await TestRenderer.act(async () => {
      watchCallback?.(makePosition(40.7128, -74.006, 35));
    });

    expect(statuses).toContainEqual({
      accuracyM: 35,
      kind: 'ready',
      lat: 40.7128,
      lon: -74.006,
    });
  });

  it('never emits a hard error when the one-shot fixes fail while the watch is alive', async () => {
    getLastKnownPositionAsyncMock.mockResolvedValue(null);
    getCurrentPositionAsyncMock.mockRejectedValue(new Error('no provider fix'));
    // Watch subscribes successfully but never delivers a sample.
    watchPositionAsyncMock.mockResolvedValue({ remove });
    const statuses: LocationStatus[] = [];

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Probe enabled onStatus={(status) => statuses.push(status)} />,
      );
    });
    await flushAsyncWork();

    expect(statuses.some((s) => s.kind === 'error')).toBe(false);
    expect(statuses.some((s) => s.kind === 'searchingSlow')).toBe(true);
  });

  it('paints a fast coarse one-shot fix, then refines to the tighter live fix', async () => {
    getLastKnownPositionAsyncMock.mockResolvedValue(null);
    let watchCallback: ((pos: Location.LocationObject) => void) | null = null;
    watchPositionAsyncMock.mockImplementationOnce((_options, callback) => {
      watchCallback = callback;
      return Promise.resolve({ remove });
    });
    getCurrentPositionAsyncMock.mockImplementation((options?: { accuracy?: number }) => {
      // Accuracy.Low === 2 → the fast coarse one-shot. The fine pass stays pending
      // here so the tighter refine arrives from the watch (the realistic path).
      if (options?.accuracy === 2) return Promise.resolve(makePosition(41, 29, 1500));
      return never<Location.LocationObject>();
    });
    const statuses: LocationStatus[] = [];

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Probe enabled onStatus={(status) => statuses.push(status)} />,
      );
    });
    await flushAsyncWork();

    // The coarse fix paints first…
    expect(statuses).toContainEqual({ accuracyM: 1500, kind: 'ready', lat: 41, lon: 29 });

    // …then a tighter live fix refines it.
    await TestRenderer.act(async () => {
      watchCallback?.(makePosition(41.001, 29.001, 30));
    });

    expect(statuses[statuses.length - 1]).toEqual({
      accuracyM: 30,
      kind: 'ready',
      lat: 41.001,
      lon: 29.001,
    });
  });

  it('does not downgrade a tighter fix when a looser one-shot resolves afterwards', async () => {
    getLastKnownPositionAsyncMock.mockResolvedValue(null);
    let watchCallback: ((pos: Location.LocationObject) => void) | null = null;
    watchPositionAsyncMock.mockImplementationOnce((_options, callback) => {
      watchCallback = callback;
      return Promise.resolve({ remove });
    });
    getCurrentPositionAsyncMock.mockReturnValue(never<Location.LocationObject>());
    const statuses: LocationStatus[] = [];

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Probe enabled onStatus={(status) => statuses.push(status)} />,
      );
    });
    await flushAsyncWork();

    // A precise live fix arrives first.
    await TestRenderer.act(async () => {
      watchCallback?.(makePosition(41, 29, 12));
    });
    // A stale, looser fix must not clobber the tighter one.
    await TestRenderer.act(async () => {
      watchCallback?.(makePosition(41, 29, 12));
    });

    const last = statuses[statuses.length - 1];
    expect(last).toEqual({ accuracyM: 12, kind: 'ready', lat: 41, lon: 29 });
  });

  it('logs the Android permission accuracy breadcrumb for on-device diagnosis', async () => {
    requestForegroundPermissionsAsyncMock.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      android: { accuracy: 'coarse', scope: 'whenInUse' },
    });
    getLastKnownPositionAsyncMock.mockResolvedValue(null);
    const infoSpy = jest.spyOn(logger, 'info');

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<Probe enabled onStatus={() => {}} />);
    });
    await flushAsyncWork();

    expect(infoSpy).toHaveBeenCalledWith(
      'useUserLocation: permission',
      expect.objectContaining({ androidAccuracy: 'coarse' }),
    );
    infoSpy.mockRestore();
  });

  it('still surfaces a hard error when a location API throws before any source starts', async () => {
    hasServicesEnabledAsyncMock.mockRejectedValue(new Error('boom'));
    const statuses: LocationStatus[] = [];

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <Probe enabled onStatus={(status) => statuses.push(status)} />,
      );
    });
    await flushAsyncWork();

    expect(statuses.some((s) => s.kind === 'error')).toBe(true);
  });
});
