import { registerDevice } from './deviceRegistry';
import { ensureAndroidChannel } from './notificationScheduler';
import { syncYearly } from './prayerService';
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
    await syncYearly(
      input.location.districtId,
      input.location.districtName,
      input.location.timezone,
      { force: true },
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
