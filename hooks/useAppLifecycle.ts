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

export async function runLifecycleOnce(): Promise<void> {
  const loc = useLocationStore.getState().selected;
  if (!loc) return;
  const settings = useSettingsStore.getState();

  await reconcilePermissionFlag();

  let syncFailed = false;
  try {
    await syncYearly(loc.districtId, loc.districtName, loc.timezone);
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
    // Distinct from 'transient' so the banner copy points at the push
    // side (Expo backend / network), not at server-side registration.
    settingsActions.setDeviceRegistrationPending(true);
    setDeviceError({ code: 'push-token-unavailable' });
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
