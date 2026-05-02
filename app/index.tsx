import { Redirect } from 'expo-router';

import { useSettingsStore } from '@/store/settingsStore';

export default function Index() {
  const done = useSettingsStore((s) => s.onboardingCompleted);
  return <Redirect href={done ? '/(tabs)/home' : '/onboarding'} />;
}
