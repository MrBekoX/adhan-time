import { Alert, Platform } from 'react-native';

import {
  canScheduleExactAlarms,
  isIgnoringBatteryOptimizations,
  openExactAlarmSettings,
  requestIgnoreBatteryOptimizations,
} from '@/modules/adhan-player';
import { i18n } from '@/locales/i18n';

export type AdhanPermissionPrompt = 'exact-alarm' | 'battery-opt' | null;

// Pure decision: which OS permission (if any) still needs prompting before the
// native full-adhan player can fire reliably. Exact-alarm first (the alarm won't
// even arm exactly without it on API 31+), then the battery-optimization
// exemption (best-effort against OEM doze). Returns null when nothing is missing
// or the platform has no such gate (iOS / API < 31 report granted). Split out so
// the ordering is unit-testable without mocking Platform/Alert.
export function nextAdhanPermissionPrompt(state: {
  isAndroid: boolean;
  canScheduleExact: boolean;
  ignoringBatteryOptimizations: boolean;
}): AdhanPermissionPrompt {
  if (!state.isAndroid) return null;
  if (!state.canScheduleExact) return 'exact-alarm';
  if (!state.ignoringBatteryOptimizations) return 'battery-opt';
  return null;
}

// On Android the full-adhan player relies on exact alarms (and survives OEM doze
// better with a battery-optimization exemption). Guide the user to grant these
// instead of silently relying on best-effort alarms. We send them to the
// exact-alarm screen first; only once that is granted do we prompt for the
// battery-opt exemption so two system dialogs never stack at once. No false "it
// always works" claim — OEM doze can still interfere (see rules/04).
//
// Shared by the onboarding finalize step AND the Settings sound toggle: enabling
// the adhan from Settings must request the same permissions onboarding does,
// otherwise the native player stays unarmed/doze-killed and the adhan silently
// never plays.
export function promptAndroidAdhanPermissions(): void {
  const prompt = nextAdhanPermissionPrompt({
    isAndroid: Platform.OS === 'android',
    canScheduleExact: canScheduleExactAlarms(),
    ignoringBatteryOptimizations: isIgnoringBatteryOptimizations(),
  });
  if (prompt === 'exact-alarm') {
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
  if (prompt === 'battery-opt') {
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
