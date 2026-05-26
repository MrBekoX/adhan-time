import { Redirect } from 'expo-router';

import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';

export function getInitialRoute(
  onboardingCompleted: boolean,
  selectedLocation: unknown,
): '/(tabs)/home' | '/onboarding' {
  return onboardingCompleted && selectedLocation ? '/(tabs)/home' : '/onboarding';
}

export default function Index() {
  const done = useSettingsStore((s) => s.onboardingCompleted);
  const selected = useLocationStore((s) => s.selected);
  return <Redirect href={getInitialRoute(done, selected)} />;
}
