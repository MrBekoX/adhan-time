import { isIgnoringBatteryOptimizations } from '..';

describe('battery-optimization module (TS wrapper)', () => {
  it('returns false when the native module is unavailable (jest/iOS)', () => {
    expect(isIgnoringBatteryOptimizations()).toBe(false);
  });
});
