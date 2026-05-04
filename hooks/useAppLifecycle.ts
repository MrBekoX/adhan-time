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

  // Clear a stale sync-failed banner the next time the cycle succeeds — a
  // server outage from yesterday should not haunt today's UI.
  if (!syncFailed) {
    const cur = useUiStore.getState().lastError;
    if (cur?.code === 'sync-failed') useUiStore.getState().setError(null);
  }

  // V16+F6: registerDevice returns false after exhausting its 3-retry chain.
  // Persist a "pending" flag so the next foreground tick re-attempts even
  // after a process kill, and surface a banner so the user can manually
  // retry from Settings. Successful registration clears both.
  const registered = await registerDevice({
    districtId: loc.districtId,
    districtName: loc.districtName,
    countryName: loc.countryName,
    timezone: loc.timezone,
    locale: settings.locale,
    sound: settings.sound,
    enabledPrayers: settings.enabledPrayers,
  });

  if (registered) {
    if (useSettingsStore.getState().deviceRegistrationPending) {
      useSettingsStore.getState().setDeviceRegistrationPending(false);
    }
    const cur = useUiStore.getState().lastError;
    if (cur?.code === 'device-registration-failed') useUiStore.getState().setError(null);
  } else {
    useSettingsStore.getState().setDeviceRegistrationPending(true);
    useUiStore.getState().setError({ code: 'device-registration-failed' });
  }
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
