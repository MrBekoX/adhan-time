import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeBatteryOptimization = {
  isIgnoringBatteryOptimizations(): boolean;
};

// Returns null in Expo Go / jest / iOS (no Android module) so callers degrade safely.
const native = requireOptionalNativeModule<NativeBatteryOptimization>('BatteryOptimization');

/**
 * True iff the OS reports this app exempt from battery optimization (Android).
 * Returns false when the native module is absent (iOS, Expo Go, jest). Callers
 * that must distinguish iOS should branch on Platform.OS before calling
 * (see services/batteryOptimization.isBatteryExempt).
 */
export function isIgnoringBatteryOptimizations(): boolean {
  return native?.isIgnoringBatteryOptimizations() ?? false;
}
