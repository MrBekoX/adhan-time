import { registerDevice } from './deviceRegistry';
import { ensureAndroidChannel } from './notificationScheduler';
import { resetScheduleForLocation } from './prayerService';
import { requestPermission } from './pushService';

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
    return { ok: true, permissionGranted };
  } catch (error) {
    logger.error('onboarding-finalize-failed', { error: String(error) });
    return { ok: false, error };
  }
}
