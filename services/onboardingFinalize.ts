import { Alert, Platform } from 'react-native';

import { registerDevice } from './deviceRegistry';
import { ensureAndroidChannel } from './notificationScheduler';
import { resetScheduleForLocation } from './prayerService';
import { requestPermission } from './pushService';

import { i18n } from '@/locales/i18n';
import {
  canScheduleExactAlarms,
  isIgnoringBatteryOptimizations,
  openExactAlarmSettings,
  requestIgnoreBatteryOptimizations,
} from '@/modules/adhan-player';
import type { PersistedLocation } from '@/store/locationStore.migration';
import { logger } from '@/utils/logger';

export type FinalizeInput = {
  location: PersistedLocation;
  locale: string;
  sound: string;
  enabledPrayers: string[];
};

export type FinalizeResult =
  | { ok: true; permissionGranted: boolean }
  | { ok: false; error: unknown };

// On Android the full-adhan player relies on exact alarms (and survives OEM
// doze better with a battery-optimization exemption). Guide the user to grant
// these instead of silently relying on best-effort alarms. We send them to the
// exact-alarm screen first; only once that is granted do we prompt for the
// battery-opt exemption so two system dialogs never stack at once. No false
// "it always works" claim — OEM doze can still interfere (see rules/04).
function promptAndroidAdhanPermissions(): void {
  if (Platform.OS !== 'android') return;
  if (!canScheduleExactAlarms()) {
    Alert.alert(
      i18n.t('screens.permissions.exactAlarmTitle'),
      i18n.t('screens.permissions.exactAlarmBody'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        { text: i18n.t('common.openSettings'), onPress: () => openExactAlarmSettings() },
      ],
    );
    return;
  }
  if (!isIgnoringBatteryOptimizations()) {
    Alert.alert(
      i18n.t('screens.permissions.batteryOptTitle'),
      i18n.t('screens.permissions.batteryOptBody'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('common.openSettings'),
          onPress: () => requestIgnoreBatteryOptimizations(),
        },
      ],
    );
  }
}

// Returns a discriminated result instead of throwing so the screen can
// decide between retry-alert (`ok: false`) and a persistent denied-permission
// banner (`ok: true && !permissionGranted`) without burying raw errors.
export async function finalizeOnboarding(input: FinalizeInput): Promise<FinalizeResult> {
  try {
    const permissionGranted = await requestPermission();
    await ensureAndroidChannel();
    // Hard-reset prior notifications before scheduling the new location so a
    // previously-configured city can't keep firing (rules/00 S4). This is also
    // the first-onboarding path, where the reset is a harmless no-op.
    await resetScheduleForLocation(
      input.location.districtId,
      input.location.districtName,
      input.location.timezone,
    );
    await registerDevice({
      districtId: input.location.districtId,
      districtName: input.location.districtName,
      countryName: input.location.countryName,
      timezone: input.location.timezone,
      locale: input.locale,
      sound: input.sound,
      enabledPrayers: input.enabledPrayers,
    });
    // The adhan reconcile (arming native alarms) runs via the scheduler; here we
    // only ensure the OS-level permissions that arming depends on are granted.
    if (input.sound === 'adhanShort') promptAndroidAdhanPermissions();
    return { ok: true, permissionGranted };
  } catch (error) {
    logger.error('onboarding-finalize-failed', { error: String(error) });
    return { ok: false, error };
  }
}
