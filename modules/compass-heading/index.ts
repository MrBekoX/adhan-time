import { type EventSubscription, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * A single heading reading. Shape matches expo-location's LocationHeadingObject so this
 * module is a drop-in source for useDeviceHeading -> selectHeadingSource.
 */
export type HeadingReading = {
  /** -1 when unavailable. The Android rotation-vector path is always -1 (magnetic-referenced). */
  trueHeading: number;
  /** Azimuth in [0,360). Android: magnetic-north referenced. iOS: CLHeading.magneticHeading. */
  magHeading: number;
  /** Platform-native: iOS degrees (-1 sentinel) / Android fused rotation-vector SENSOR_STATUS_* (0..3). */
  accuracy: number;
  /**
   * Android RAW magnetometer calibration accuracy (SENSOR_STATUS_* 0..3); -1 when absent (iOS, or a
   * build without the magnetometer). The fused `accuracy` above can read "high" with an uncalibrated
   * mag, so the JS reliability gate takes the worse of the two (rules/11).
   */
  magAccuracy?: number;
  /**
   * Android RAW magnetometer field magnitude |B| in microtesla; -1 when absent (iOS). Compared in JS
   * to the expected geomagnetic intensity to detect magnetic interference the fused accuracy misses.
   */
  fieldMicroTesla?: number;
};

type NativeCompassHeading = {
  isAvailable(): boolean;
  /** Android only — the iOS module is pass-through and defines no setTuning (hence optional). */
  setTuning?(minCutoff: number, beta: number, dCutoff: number): void;
  addListener(eventName: 'onHeading', listener: (reading: HeadingReading) => void): EventSubscription;
};

// requireOptionalNativeModule returns null in Expo Go / on a build without the module,
// so callers transparently fall back to expo-location.
const native = requireOptionalNativeModule<NativeCompassHeading>('CompassHeading');

/** True when a fused-heading sensor (rotation vector / CLHeading) is present. */
export function isAvailable(): boolean {
  return native?.isAvailable() ?? false;
}

/**
 * Subscribe to fused heading readings. Call only when isAvailable() is true.
 * Returns a subscription whose remove() stops the sensor when it is the last listener.
 */
export function addHeadingListener(cb: (reading: HeadingReading) => void): EventSubscription {
  if (!native) {
    throw new Error('CompassHeading native module unavailable; guard calls with isAvailable()');
  }
  return native.addListener('onHeading', cb);
}

/**
 * Push One Euro filter params to the native smoother. No-op when the native module is absent
 * (Expo Go) or the platform build lacks the function (iOS is pass-through), so callers need no
 * Platform guard. JS-settable so tuning ships via OTA without a rebuild (spec §3 setTuning).
 */
export function setTuning(minCutoff: number, beta: number, dCutoff: number): void {
  if (native && typeof native.setTuning === 'function') {
    native.setTuning(minCutoff, beta, dCutoff);
  }
}
