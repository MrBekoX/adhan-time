import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import { isIgnoringBatteryOptimizations } from '@/modules/battery-optimization';
import { logger } from '@/utils/logger';

// Whether to prompt for a battery-optimization exemption. Android only: iOS has no
// such concept. We only ask once notifications are actually granted (no point
// otherwise) and only once (a persisted flag), so onboarding doesn't nag.
export function shouldAskBatteryExemption(input: {
  isAndroid: boolean;
  permissionGranted: boolean;
  alreadyAsked: boolean;
}): boolean {
  return input.isAndroid && input.permissionGranted && !input.alreadyAsked;
}

// Opens the Android system dialog to exempt this app from battery optimization.
// WHY: on aggressive OEMs (Samsung et al.) a killed, non-exempt app has its exact
// alarms deferred/blocked by Doze, so prayer/reminder notifications silently fail to
// fire (device-proven on a Galaxy A30s — an overdue adhan fired the instant the app
// was whitelisted). Exempting the app is the reliable fix.
//
// Best-effort and NEVER throws: a failure here must not break onboarding. The direct
// REQUEST_IGNORE_BATTERY_OPTIMIZATIONS dialog needs the package uri and the
// matching manifest permission; if the activity is missing on some ROM we fall back
// to the full battery-optimization list, then to the app's own settings page.
export async function requestBatteryExemption(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const pkg = Constants.expoConfig?.android?.package;
  if (pkg) {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        { data: `package:${pkg}` },
      );
      return;
    } catch (error) {
      logger.warn('battery-exemption-request-failed', { error: String(error) });
    }
  } else {
    // Should never happen in a built app; signal it instead of silently using the
    // list fallback, so a config regression that strips android.package is visible.
    logger.warn('battery-exemption-no-package-id');
  }

  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
    );
  } catch (error) {
    logger.warn('battery-exemption-settings-failed', { error: String(error) });
    await Linking.openSettings().catch(() => undefined);
  }
}

// OS battery-optimization exemption state — Android only. Returns undefined on
// iOS (no such concept) and on a native read failure; the caller then OMITS
// batteryExempt from the register payload so the server keeps the conservative
// 5-day gate. Never a FALSE exempt/non-exempt claim (rules/11 accuracy). Never throws.
export async function isBatteryExempt(): Promise<boolean | undefined> {
  if (Platform.OS !== 'android') return undefined;
  try {
    return isIgnoringBatteryOptimizations();
  } catch (e) {
    logger.warn('battery-exempt-read-failed', { error: String(e) });
    return undefined;
  }
}
