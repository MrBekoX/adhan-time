import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { registerDeviceDetailed } from '@/services/deviceRegistry';
import { syncYearly } from '@/services/prayerService';
import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { logger } from '@/utils/logger';

export function useAppLifecycle(): void {
  useEffect(() => {
    void runLifecycleOnce();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') void runLifecycleOnce();
    });
    return () => sub.remove();
  }, []);
}

// Collapse overlapping lifecycle runs into one. runLifecycleOnce fires on mount,
// on every AppState 'active', and from the Home retry button. Granting the Qibla
// location permission churns the Android activity (pause → resume → 'active'), so a
// second run can start while the slow launch run (syncYearly does network I/O) is
// still mid-flight. Two overlapping reconcile() passes then dispatch schedule/cancel
// for the SAME notification ids concurrently and one rejects → a FALSE
// 'partial-schedule' banner. Returning the in-flight promise to a second caller makes
// only one reconcile touch the store at a time. .finally clears the guard so the next
// genuine foreground tick still runs; real-failure banners still surface because
// runLifecycleInner routes failures to uiStore and does not throw here.
let inFlight: Promise<void> | null = null;

// Force-stop / aggressive-OEM kill cancels the app's AlarmManager alarms but
// leaves expo-notifications' SharedPreferences store intact, so a normal diff
// reconcile sees every prayer as "already scheduled" and re-registers NOTHING —
// notifications silently die until the user changes a setting. On the first
// lifecycle run of this process we force a full re-schedule so the real alarms
// are always rebuilt. Kept true until a forced sync actually succeeds (a failed
// cold start — e.g. offline at launch — must retry the force, not skip it).
let needsColdReschedule = true;

export function runLifecycleOnce(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runLifecycleInner().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runLifecycleInner(): Promise<void> {
  const loc = useLocationStore.getState().selected;
  if (!loc) return;
  const settings = useSettingsStore.getState();

  await reconcilePermissionFlag();

  let syncFailed = false;
  try {
    await syncYearly(loc.districtId, loc.districtName, loc.timezone, {
      forceReschedule: needsColdReschedule,
    });
    // Clear only after a successful forced sync, so an offline cold start keeps
    // forcing the self-heal on later foreground ticks instead of giving up.
    needsColdReschedule = false;
  } catch (e) {
    syncFailed = true;
    logger.warn('lifecycle-sync-failed', { error: String(e) });
    useUiStore.getState().setError({ code: 'sync-failed', message: String(e) });
  }

  // Clear a stale 'sync-failed' banner once the cycle succeeds — a banner
  // from a previous failed attempt should not persist past a recovery.
  // 'partial-sync' is intentionally NOT cleared here: it can be set INSIDE
  // syncYearly by fetchNextYearStart even on a successful run, so this
  // pass would clobber the banner the same call just emitted.
  if (!syncFailed) {
    const cur = useUiStore.getState().lastError;
    if (cur?.code === 'sync-failed') useUiStore.getState().setError(null);
  }

  // The 'transient' branch persists a pending flag so the next foreground
  // tick re-attempts (even across process kills) and surfaces the generic
  // banner with a retry. The 'incompatible' branch (4xx — schema drift,
  // signing-key rotation) emits a distinct banner pointing the user at an
  // app update; we do NOT set pending because retry won't help.
  const result = await registerDeviceDetailed({
    districtId: loc.districtId,
    districtName: loc.districtName,
    countryName: loc.countryName,
    timezone: loc.timezone,
    locale: settings.locale,
    sound: settings.sound,
    enabledPrayers: settings.enabledPrayers,
  });

  const settingsActions = useSettingsStore.getState();
  const ui = useUiStore.getState();

  if (result.ok) {
    if (settingsActions.deviceRegistrationPending) {
      settingsActions.setDeviceRegistrationPending(false);
    }
    const cur = ui.lastError;
    if (
      cur?.code === 'device-registration-failed' ||
      cur?.code === 'device-registration-incompatible' ||
      cur?.code === 'push-token-unavailable'
    ) {
      ui.setError(null);
    }
  } else if (result.reason === 'registration-disabled') {
    if (settingsActions.deviceRegistrationPending) {
      settingsActions.setDeviceRegistrationPending(false);
    }
    const cur = ui.lastError;
    if (
      cur?.code === 'device-registration-failed' ||
      cur?.code === 'device-registration-incompatible' ||
      cur?.code === 'push-token-unavailable'
    ) {
      ui.setError(null);
    }
  } else if (result.reason === 'incompatible') {
    if (settingsActions.deviceRegistrationPending) {
      settingsActions.setDeviceRegistrationPending(false);
    }
    setDeviceError({
      code: 'device-registration-incompatible',
      data: { status: result.status },
    });
  } else if (result.reason === 'transient') {
    settingsActions.setDeviceRegistrationPending(true);
    setDeviceError({ code: 'device-registration-failed' });
  } else if (result.reason === 'token-fetch-failed') {
    // Push token fetch is the OPTIONAL server-side fallback path (rules/04):
    // local notifications schedule independently and keep working without it.
    // The original design surfaced a banner here, but on builds without FCM v1
    // it pins forever — and no amount of user retry fixes a missing native
    // credential. Set pending=true so the next foreground silently retries
    // (handles transient network), but DO NOT alarm the user: a missing
    // optional fallback is not worth blocking the home screen. The underlying
    // SDK exception is still logged via logger.error → adb logcat for
    // diagnosis. Clear any stale banner left by older builds.
    settingsActions.setDeviceRegistrationPending(true);
    const cur = ui.lastError;
    if (cur?.code === 'push-token-unavailable') ui.setError(null);
  }
  // 'no-token' covers simulator + permission-denied. Permission state is
  // already surfaced through notificationPermissionDenied elsewhere.
}

function setDeviceError(error: NonNullable<ReturnType<typeof useUiStore.getState>['lastError']>): void {
  const ui = useUiStore.getState();
  const current = ui.lastError;
  if (current?.code === 'sync-failed' || current?.code === 'partial-sync') return;
  ui.setError(error);
}

// Keep notificationPermissionDenied in sync with the OS on every foreground
// tick — without this, a user who revokes permission in system settings
// still sees a clean app and silently misses every prayer notification.
async function reconcilePermissionFlag(): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    const denied = perm.status !== 'granted';
    const current = useSettingsStore.getState().notificationPermissionDenied;
    if (denied !== current) {
      useSettingsStore.getState().setNotificationPermissionDenied(denied);
    }
  } catch (e) {
    logger.warn('permission-reconcile-failed', { error: String(e) });
  }
}
