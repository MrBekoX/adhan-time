import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type SoundKind = 'fajr' | 'regular';

export type ArmedPrayer = {
  id: string;
  prayerKey: string;
  fireAtEpochMs: number;
  soundKind: SoundKind;
  title: string;
  body: string;
};

type Native = {
  armPrayers(prayers: ArmedPrayer[]): Promise<void>;
  cancelAll(): Promise<void>;
  stopPlayback(): void;
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): void;
};

// Android-only native module; on iOS every call is a no-op (iOS keeps the
// expo-notifications <=30s clip path — it cannot stop a killed-app sound).
const native: Native | null =
  Platform.OS === 'android' ? requireNativeModule<Native>('AdhanPlayer') : null;

export async function armPrayers(prayers: ArmedPrayer[]): Promise<void> {
  if (native) await native.armPrayers(prayers);
}

export async function cancelAll(): Promise<void> {
  if (native) await native.cancelAll();
}

export function stopPlayback(): void {
  native?.stopPlayback();
}

// true on iOS so callers never block the adhan path for an OS-only limitation
// that does not apply there.
export function canScheduleExactAlarms(): boolean {
  return native ? native.canScheduleExactAlarms() : true;
}

export function openExactAlarmSettings(): void {
  native?.openExactAlarmSettings();
}

// true on iOS for the same reason — there is no battery-optimization gate to
// satisfy on the iOS clip path.
export function isIgnoringBatteryOptimizations(): boolean {
  return native ? native.isIgnoringBatteryOptimizations() : true;
}

export function requestIgnoreBatteryOptimizations(): void {
  native?.requestIgnoreBatteryOptimizations();
}
