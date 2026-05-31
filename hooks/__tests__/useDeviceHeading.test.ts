import * as Location from 'expo-location';
import * as React from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';

import {
  classifyQuality,
  isUnreliable,
  normalizeAccuracyForPlatform,
  showAlignmentVisuals,
} from '@/utils/heading';

import { useDeviceHeading } from '../useDeviceHeading';

jest.mock('expo-location', () => ({
  watchHeadingAsync: jest.fn(),
}));

const watchHeadingAsyncMock = Location.watchHeadingAsync as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('classifyQuality', () => {
  it('returns "unknown" when accuracy is null', () => {
    expect(classifyQuality(null)).toBe('unknown');
  });

  it('returns "high" when accuracy is within goodMaxDeg', () => {
    expect(classifyQuality(15)).toBe('high');
  });

  it('returns "medium" when accuracy is within warnMaxDeg', () => {
    expect(classifyQuality(30)).toBe('medium');
  });

  it('returns "low" when accuracy is within lowMaxDeg', () => {
    expect(classifyQuality(50)).toBe('low');
  });

  it('returns "unreliable" when accuracy exceeds lowMaxDeg', () => {
    expect(classifyQuality(80)).toBe('unreliable');
  });
});

describe('isUnreliable', () => {
  it('treats "unknown" as unreliable so we never show a misleading needle', () => {
    expect(isUnreliable('unknown')).toBe(true);
  });

  it('treats "unreliable" as unreliable', () => {
    expect(isUnreliable('unreliable')).toBe(true);
  });

  it('does not treat "high" as unreliable', () => {
    expect(isUnreliable('high')).toBe(false);
  });

  it('does not treat "medium" or "low" as unreliable (banner suffices)', () => {
    expect(isUnreliable('medium')).toBe(false);
    expect(isUnreliable('low')).toBe(false);
  });
});

describe('normalizeAccuracyForPlatform', () => {
  it('returns null for null/undefined input', () => {
    expect(normalizeAccuracyForPlatform(null, 'ios')).toBeNull();
    expect(normalizeAccuracyForPlatform(undefined, 'android')).toBeNull();
  });

  it('returns null for the iOS uncalibrated sentinel (-1)', () => {
    expect(normalizeAccuracyForPlatform(-1, 'ios')).toBeNull();
  });

  it('passes iOS degree readings through unchanged', () => {
    expect(normalizeAccuracyForPlatform(12.5, 'ios')).toBe(12.5);
  });

  it('maps Android SENSOR_STATUS_UNRELIABLE (0) to a high-degree value so quality is "unreliable"', () => {
    // Bug K3c: Android's sensor accuracy 0 means SENSOR_STATUS_UNRELIABLE, not "0 degrees of error".
    // We force a value above lowMaxDeg so classifyQuality returns 'unreliable'.
    const value = normalizeAccuracyForPlatform(0, 'android');
    expect(value).not.toBeNull();
    expect(classifyQuality(value)).toBe('unreliable');
  });

  it('maps Android SENSOR_STATUS_ACCURACY_HIGH (3) to ~5°', () => {
    expect(normalizeAccuracyForPlatform(3, 'android')).toBe(5);
  });

  it('maps Android SENSOR_STATUS_ACCURACY_MEDIUM (2) to ~15°', () => {
    expect(normalizeAccuracyForPlatform(2, 'android')).toBe(15);
  });

  it('maps Android SENSOR_STATUS_ACCURACY_LOW (1) to ~30°', () => {
    expect(normalizeAccuracyForPlatform(1, 'android')).toBe(30);
  });
});

describe('showAlignmentVisuals (K3b)', () => {
  it('hides halo + ring when unreliable, even if aligned latched true', () => {
    expect(showAlignmentVisuals(true, true)).toBe(false);
  });

  it('shows halo + ring when aligned and reading is reliable', () => {
    expect(showAlignmentVisuals(true, false)).toBe(true);
  });

  it('hides halo + ring when not aligned', () => {
    expect(showAlignmentVisuals(false, false)).toBe(false);
    expect(showAlignmentVisuals(false, true)).toBe(false);
  });
});

describe('useDeviceHeading subscription lifecycle', () => {
  beforeEach(() => {
    watchHeadingAsyncMock.mockReset();
  });

  function Probe(): null {
    useDeviceHeading({ enabled: true });
    return null;
  }

  it('removes a heading subscription when watchHeadingAsync resolves after unmount', async () => {
    const remove = jest.fn();
    const pendingWatch = deferred<Location.LocationSubscription>();
    watchHeadingAsyncMock.mockReturnValueOnce(pendingWatch.promise);

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
    });
    expect(watchHeadingAsyncMock).toHaveBeenCalledTimes(1);

    await TestRenderer.act(async () => {
      tree?.unmount();
    });
    expect(remove).not.toHaveBeenCalled();

    await TestRenderer.act(async () => {
      pendingWatch.resolve({ remove } as Location.LocationSubscription);
      await pendingWatch.promise;
    });

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('smooths the Android heading (damps a raw step) instead of passing the raw value through', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      let headingCallback: ((reading: Location.LocationHeadingObject) => void) | null = null;
      watchHeadingAsyncMock.mockImplementationOnce(
        async (cb: (reading: Location.LocationHeadingObject) => void) => {
          headingCallback = cb;
          return { remove: jest.fn() } as Location.LocationSubscription;
        },
      );
      const statuses: ReturnType<typeof useDeviceHeading>[] = [];

      function StatusProbe(): null {
        const status = useDeviceHeading({
          enabled: true,
          location: { lat: 41.0082, lon: 28.9784 },
        });
        statuses.push(status);
        return null;
      }

      let tree: TestRenderer.ReactTestRenderer | null = null;
      await TestRenderer.act(async () => {
        tree = TestRenderer.create(React.createElement(StatusProbe));
        await Promise.resolve();
      });
      expect(headingCallback).not.toBeNull();

      await TestRenderer.act(async () => {
        headingCallback?.({ trueHeading: 0, magHeading: 0, accuracy: 3 });
      });
      await TestRenderer.act(async () => {
        headingCallback?.({ trueHeading: 90, magHeading: 90, accuracy: 3 });
      });

      const ready = statuses.filter((s) => s.kind === 'ready').at(-1);
      expect(ready?.kind).toBe('ready');
      if (ready?.kind !== 'ready') throw new Error('expected ready heading');
      // EMA restored on Android: a raw 0->90 step must be DAMPED (≈18 at alpha 0.2),
      // not passed straight through as 90 (the bypass that caused on-device jitter).
      expect(ready.heading).toBeGreaterThan(0);
      expect(ready.heading).toBeLessThan(45);

      await TestRenderer.act(async () => tree?.unmount());
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});
