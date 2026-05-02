import { Stack } from 'expo-router';

import { colors } from '@/components/Theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="select-language" options={{ title: '' }} />
      <Stack.Screen name="select-country" options={{ title: '' }} />
      <Stack.Screen name="select-state" options={{ title: '' }} />
      <Stack.Screen name="select-district" options={{ title: '' }} />
      <Stack.Screen name="permissions" options={{ title: '' }} />
    </Stack>
  );
}
