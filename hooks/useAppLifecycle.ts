import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { registerDevice } from '@/services/deviceRegistry';
import { syncYearly } from '@/services/prayerService';
import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { logger } from '@/utils/logger';

export function useAppLifecycle(): void {
  useEffect(() => {
    void runOnce();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') void runOnce();
    });
    return () => sub.remove();
  }, []);
}

async function runOnce(): Promise<void> {
  const loc = useLocationStore.getState().selected;
  if (!loc) return;
  const settings = useSettingsStore.getState();

  try {
    await syncYearly(loc.districtId, loc.districtName, loc.timezone);
  } catch (e) {
    logger.warn('lifecycle sync failed', { error: String(e) });
  }
  await registerDevice({
    districtId: loc.districtId,
    districtName: loc.districtName,
    countryName: loc.countryName,
    timezone: loc.timezone,
    locale: settings.locale,
    sound: settings.sound,
    enabledPrayers: settings.enabledPrayers,
  });
}
