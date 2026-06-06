import * as Location from 'expo-location';
import * as React from 'react';
import { Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import TestRenderer from 'react-test-renderer';

import { ONE_EURO_BETA, ONE_EURO_DCUTOFF, ONE_EURO_MIN_CUTOFF } from '@/constants/qibla';
import * as CompassHeading from '@/modules/compass-heading';
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

jest.mock('@/modules/compass-heading', () => ({
  isAvailable: jest.fn(() => true),
  addHeadingListener: jest.fn(),
  setTuning: jest.fn(),
}));

const isAvailableMock = CompassHeading.isAvailable as jest.Mock;
const addHeadingListenerMock = CompassHeading.addHeadingListener as jest.Mock;

beforeEach(() => {
  isAvailableMock.mockReturnValue(true);
  addHeadingListenerMock.mockReset();
  // Safe default so a test that reaches the native path without its own implementation
  // gets a removable subscription instead of a confusing "undefined.remove()" crash.
  addHeadingListenerMock.mockReturnValue({ remove: jest.fn() });
  watchHeadingAsyncMock.mockReset();
});

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
  function Probe(): null {
    useDeviceHeading({ enabled: true });
    return null;
  }

  it('removes a heading subscription when watchHeadingAsync resolves after unmount', async () => {
    // Exercises the async expo-location fallback path: a subscription that resolves
    // AFTER unmount must still be removed. The native module is synchronous, so this
    // race is unique to the expo-location branch — drive it by forcing the fallback.
    isAvailableMock.mockReturnValue(false);
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

  it('passes the fused heading through without a JS EMA (native One Euro now smooths)', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      let headingCallback: ((reading: Location.LocationHeadingObject) => void) | null = null;
      addHeadingListenerMock.mockImplementation((cb) => {
        headingCallback = cb;
        return { remove: jest.fn() };
      });
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
      // Smoothing moved to the native One Euro filter (CompassHeadingModule), so the JS fused
      // path no longer damps — it passes the heading through. (jest mocks the native module and
      // feeds raw values, so a 0->90 step arrives as a clean 90.) The old JS EMA was a stopgap
      // for the then-RAW native feed; redundant now. The fallback path keeps its EMA.
      expect(ready.heading).toBeCloseTo(90, 5);

      await TestRenderer.act(async () => tree?.unmount());
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});

describe('useDeviceHeading — heading source selection', () => {
  it('subscribes to the fused compass-heading module when available', async () => {
    let cb: ((r: { trueHeading: number; magHeading: number; accuracy: number }) => void) | null =
      null;
    addHeadingListenerMock.mockImplementation((listener) => {
      cb = listener;
      return { remove: jest.fn() };
    });

    function Probe(): null {
      useDeviceHeading({ enabled: true, location: { lat: 41.0082, lon: 28.9784 } });
      return null;
    }
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
      await Promise.resolve();
    });

    expect(addHeadingListenerMock).toHaveBeenCalledTimes(1);
    expect(watchHeadingAsyncMock).not.toHaveBeenCalled();
    expect(cb).not.toBeNull();

    await TestRenderer.act(async () => tree?.unmount());
  });

  it('pushes the One Euro tuning to the native module on the fused subscribe', async () => {
    const setTuningMock = CompassHeading.setTuning as jest.Mock;
    setTuningMock.mockClear();
    addHeadingListenerMock.mockImplementation(() => ({ remove: jest.fn() }));

    function Probe(): null {
      useDeviceHeading({ enabled: true, location: { lat: 41.0082, lon: 28.9784 } });
      return null;
    }
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
      await Promise.resolve();
    });

    expect(setTuningMock).toHaveBeenCalledWith(ONE_EURO_MIN_CUTOFF, ONE_EURO_BETA, ONE_EURO_DCUTOFF);

    await TestRenderer.act(async () => tree?.unmount());
  });

  it('falls back to expo-location when the native module is unavailable', async () => {
    isAvailableMock.mockReturnValue(false);
    watchHeadingAsyncMock.mockResolvedValue({ remove: jest.fn() } as Location.LocationSubscription);

    function Probe(): null {
      useDeviceHeading({ enabled: true, location: { lat: 41.0082, lon: 28.9784 } });
      return null;
    }
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
      await Promise.resolve();
    });

    expect(watchHeadingAsyncMock).toHaveBeenCalledTimes(1);
    expect(addHeadingListenerMock).not.toHaveBeenCalled();

    await TestRenderer.act(async () => tree?.unmount());
  });

  it('writes heading into headingShared past a deadband, skipping sub-threshold jitter', async () => {
    let cb: ((r: { trueHeading: number; magHeading: number; accuracy: number }) => void) | null = null;
    addHeadingListenerMock.mockImplementation((listener) => {
      cb = listener;
      return { remove: jest.fn() };
    });
    const headingShared = { value: -1 } as unknown as SharedValue<number>;

    function Probe(): null {
      useDeviceHeading({ enabled: true, location: { lat: 41.0082, lon: 28.9784 }, headingShared });
      return null;
    }
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
      await Promise.resolve();
    });

    // First sample always writes (the first fused sample is the raw value; native-smoothed upstream).
    await TestRenderer.act(async () => cb?.({ trueHeading: 123, magHeading: 123, accuracy: 3 }));
    expect(headingShared.value).toBeCloseTo(123, 5);
    const afterFirst = headingShared.value;

    // A sub-deadband change (<0.05° raw — no JS EMA now) is skipped → shared value NOT rewritten.
    await TestRenderer.act(async () => cb?.({ trueHeading: 123.03, magHeading: 123.03, accuracy: 3 }));
    expect(headingShared.value).toBe(afterFirst);

    // A real movement crosses the deadband → shared value updates again.
    await TestRenderer.act(async () => cb?.({ trueHeading: 140, magHeading: 140, accuracy: 3 }));
    expect(headingShared.value).toBeGreaterThan(afterFirst);

    await TestRenderer.act(async () => tree?.unmount());
  });

  it('feeds headingShared on (nearly) every sample during SLOW rotation — no 1Hz starvation (freeze regression)', async () => {
    // The freeze (as a hook property): a continuous slow/fine rotation (qibla alignment) must
    // keep advancing the rose target. The old 0.4° shared deadband quantized a slow ramp into
    // a write only every ~3 samples (~1Hz at 30Hz feed) → the rose sat ~1s then jumped. The
    // lowered deadband lets the smoothed ramp reach headingShared on essentially every sample.
    let cb: ((r: { trueHeading: number; magHeading: number; accuracy: number }) => void) | null = null;
    addHeadingListenerMock.mockImplementation((listener) => {
      cb = listener;
      return { remove: jest.fn() };
    });
    const headingShared = { value: -1 } as unknown as SharedValue<number>;

    function Probe(): null {
      useDeviceHeading({ enabled: true, location: { lat: 41.0082, lon: 28.9784 }, headingShared });
      return null;
    }
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(React.createElement(Probe));
      await Promise.resolve();
    });
    expect(cb).not.toBeNull();

    // trueHeading >= 0 → source 'true' (no WMM). The fused JS path no longer EMAs (native
    // smooths), so this isolates the deadband / no-starvation behaviour on a raw slow ramp.
    // 0.15°/sample ≈ a slow ~4.5°/s turn at 30Hz — exactly the fine-alignment speed that froze.
    const values: number[] = [];
    await TestRenderer.act(async () => {
      for (let i = 0; i <= 24; i++) {
        const h = i * 0.15;
        cb?.({ trueHeading: h, magHeading: h, accuracy: 3 });
        values.push(headingShared.value);
      }
    });

    let writes = 0;
    for (let i = 1; i < values.length; i++) {
      const cur = values[i];
      const prev = values[i - 1];
      if (cur !== undefined && prev !== undefined && cur > prev + 1e-9) writes++;
    }
    // ~22 with the lowered deadband; only ~7 with the old 0.4° (the starvation/freeze).
    expect(writes).toBeGreaterThanOrEqual(18);

    await TestRenderer.act(async () => tree?.unmount());
  });

  it('passes the fused path through (no JS EMA) while the expo-location fallback still EMAs (Android, §8)', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      const headingAfterStep = async (useFused: boolean): Promise<number> => {
        isAvailableMock.mockReturnValue(useFused);
        let cb: ((r: { trueHeading: number; magHeading: number; accuracy: number }) => void) | null = null;
        const sub = { remove: jest.fn() };
        if (useFused) {
          addHeadingListenerMock.mockImplementation((listener) => {
            cb = listener;
            return sub;
          });
        } else {
          watchHeadingAsyncMock.mockImplementation(async (listener) => {
            cb = listener as (r: { trueHeading: number; magHeading: number; accuracy: number }) => void;
            return sub as unknown as Location.LocationSubscription;
          });
        }
        const statuses: ReturnType<typeof useDeviceHeading>[] = [];
        function Probe(): null {
          statuses.push(useDeviceHeading({ enabled: true, location: { lat: 41.0082, lon: 28.9784 } }));
          return null;
        }
        let tree: TestRenderer.ReactTestRenderer | null = null;
        await TestRenderer.act(async () => {
          tree = TestRenderer.create(React.createElement(Probe));
          await Promise.resolve();
        });
        // trueHeading >= 0 → source 'true' (no WMM). The fused path no longer EMAs (native One
        // Euro smooths) so 0->90 passes straight to 90; the fallback keeps the Android EMA clamp.
        await TestRenderer.act(async () => cb?.({ trueHeading: 0, magHeading: 0, accuracy: 3 }));
        await TestRenderer.act(async () => cb?.({ trueHeading: 90, magHeading: 90, accuracy: 3 }));
        const ready = statuses.filter((s) => s.kind === 'ready').at(-1);
        if (ready?.kind !== 'ready') throw new Error('expected ready heading');
        await TestRenderer.act(async () => tree?.unmount());
        return ready.heading;
      };

      const fused = await headingAfterStep(true);
      const fallback = await headingAfterStep(false);

      // Fused = pass-through (90, native smooths upstream); fallback = EMA-damped (0 < x < 90).
      expect(fused).toBeCloseTo(90, 5);
      expect(fallback).toBeGreaterThan(0);
      expect(fallback).toBeLessThan(90);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});

describe('useDeviceHeading — resubscribe stability (A1)', () => {
  // Qibla bug A1: when the tab blurs/refocuses, the [enabled] effect tears down + resubscribes
  // the sensor. The smoothing state (st.smoothed) lives in a ref, NOT the effect closure, so it
  // PERSISTS across resubscribe — otherwise the next reading published RAW and the needle SNAPPED
  // from a cold baseline (the on-device "freeze then jump").
  // The native One Euro now smooths the FUSED path (JS passes it through), so this baseline-
  // persistence guard now applies to the expo-location FALLBACK path, which still keeps the JS
  // EMA — this test drives the fallback to keep that invariant under test.
  it('preserves the EMA baseline across an enabled toggle on the fallback path (no resubscribe snap)', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      isAvailableMock.mockReturnValue(false); // force the expo-location fallback (it keeps the JS EMA)
      let cb: ((r: { trueHeading: number; magHeading: number; accuracy: number }) => void) | null = null;
      watchHeadingAsyncMock.mockImplementation(async (listener) => {
        cb = listener as (r: { trueHeading: number; magHeading: number; accuracy: number }) => void;
        return { remove: jest.fn() } as unknown as Location.LocationSubscription;
      });
      const statuses: ReturnType<typeof useDeviceHeading>[] = [];

      function Probe({ enabled }: { enabled: boolean }): null {
        statuses.push(useDeviceHeading({ enabled, location: { lat: 41.0082, lon: 28.9784 } }));
        return null;
      }

      let tree: TestRenderer.ReactTestRenderer | null = null;
      await TestRenderer.act(async () => {
        tree = TestRenderer.create(React.createElement(Probe, { enabled: true }));
        await Promise.resolve();
      });

      // Seed the EMA at 0 (trueHeading >= 0 → source 'true', pure EMA, no WMM).
      await TestRenderer.act(async () => cb?.({ trueHeading: 0, magHeading: 0, accuracy: 3 }));

      // Blur (enabled false) then refocus (enabled true) → real teardown + resubscribe.
      await TestRenderer.act(async () => {
        tree?.update(React.createElement(Probe, { enabled: false }));
        await Promise.resolve();
      });
      await TestRenderer.act(async () => {
        tree?.update(React.createElement(Probe, { enabled: true }));
        await Promise.resolve();
      });

      // First reading after the resubscribe. If the EMA baseline persisted (0), the Android
      // fallback clamp gives applyEma(0, 90, 0.2) = 18 → smooth. If the baseline reset to null
      // (the bug), applyEma(null, 90) = 90 → the needle SNAPS to raw.
      await TestRenderer.act(async () => cb?.({ trueHeading: 90, magHeading: 90, accuracy: 3 }));

      const ready = statuses.filter((s) => s.kind === 'ready').at(-1);
      if (ready?.kind !== 'ready') throw new Error('expected ready heading');
      expect(ready.heading).toBeGreaterThan(0);
      expect(ready.heading).toBeLessThan(60); // ~18 (preserved) after the fix; 90 (snap) before it

      await TestRenderer.act(async () => tree?.unmount());
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});
