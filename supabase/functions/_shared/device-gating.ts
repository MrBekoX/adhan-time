// Pure gating helpers for push-prayer: decide HOW stale a device must be before
// the server sends its safety-net push. Runs in Deno (edge) and Node (jest).

// Aggressive backstop for devices whose local delivery is unreliable when killed
// (non-exempt Android — OEM Doze defers exact alarms). Device-proven: a high-priority
// FCM push reaches such a device while the local alarm is deferred.
export const SHORT_STALE_MS = 3 * 60 * 60 * 1000; // 3 hours
// Conservative backstop for devices whose local delivery is reliable (iOS, or an
// Android device exempt from battery optimization). Matches the original design.
export const LONG_STALE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export type DeviceGatingInfo = {
  platform?: string | null;
  battery_exempt?: boolean | null;
};

// The 3h backstop is opt-in: ONLY an explicit android + battery_exempt=false device
// gets it. Everything else — iOS, exempt, or a client that hasn't reported these yet
// (null/undefined) — keeps the 5d gate. So no device is double-pushed until its client
// build explicitly reports unreliable local delivery.
export function backstopCutoffMs(device: DeviceGatingInfo): number {
  const unreliableLocal = device.platform === 'android' && device.battery_exempt === false;
  return unreliableLocal ? SHORT_STALE_MS : LONG_STALE_MS;
}

export function isDueForBackstop(device: DeviceGatingInfo, lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= backstopCutoffMs(device);
}
