import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { registerDevice } from '@/services/deviceRegistry';
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

  // Clear a stale 'sync-failed' banner once the cycle succeeds — a server
  // outage from yesterday should not haunt today's UI. The 'partial-sync'
  // banner is intentionally NOT cleared here: it can be set INSIDE
  // syncYearly by fetchNextYearStart even on a successful run, so a clear
  // pass at this point would clobber the banner the same call just emitted.
  if (!syncFailed) {
    const cur = useUiStore.getState().lastError;
    if (cur?.code === 'sync-failed') useUiStore.getState().setError(null);
  }

  // The 'transient' branch persists a pending flag so the next foreground
  // tick re-attempts (even across process kills) and surfaces the generic
  // banner with a retry. The 'incompatible' branch (4xx — schema drift,
  // signing-key rotation) emits a distinct banner pointing the user at an
  // app update; we do NOT set pending because retry won't help.
  const result = await registerDevice({
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
      cur?.code === 'device-registration-incompatible'
    ) {
      ui.setError(null);
    }
  } else if (result.reason === 'incompatible') {
    if (settingsActions.deviceRegistrationPending) {
      settingsActions.setDeviceRegistrationPending(false);
    }
    ui.setError({
      code: 'device-registration-incompatible',
      data: { status: result.status },
    });
  } else if (result.reason === 'transient') {
    settingsActions.setDeviceRegistrationPending(true);
    ui.setError({ code: 'device-registration-failed' });
  }
  // 'no-token': nothing actionable. The user never granted push permission
  // (V5 already surfaced that path through notificationPermissionDenied).
}

/**
 * V5: keep `notificationPermissionDenied` in sync with the OS state on every
 * foreground tick. If the user re-enabled notifications in system settings,
 * clear the banner; if they revoked an earlier grant, surface it again so
 * silent notification-off prayer time misses are flagged loudly.
 */
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
