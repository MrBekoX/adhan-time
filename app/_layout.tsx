import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/components/Theme';
import { evaluateHydrationGate } from '@/hooks/hydrationGate';
import { i18n } from '@/locales/i18n';
import { setupForegroundHandler } from '@/services/notificationScheduler';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { logger } from '@/utils/logger';

const HYDRATION_TIMEOUT_MS = 5000;

export default function RootLayout() {
  const locHydrated = useLocationStore((s) => s.hydrated);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const prayerHydrated = usePrayerStore((s) => s.hydrated);
  const locale = useSettingsStore((s) => s.locale);

  const [timedOutFlag, setTimedOutFlag] = useState(false);

  const { ready, timedOut } = evaluateHydrationGate({
    flags: [locHydrated, settingsHydrated, prayerHydrated],
    elapsedMs: timedOutFlag ? HYDRATION_TIMEOUT_MS : 0,
    timeoutMs: HYDRATION_TIMEOUT_MS,
  });

  useEffect(() => {
    void setupForegroundHandler();
  }, []);

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale]);

  useEffect(() => {
    const allHydrated = locHydrated && settingsHydrated && prayerHydrated;
    if (allHydrated || timedOutFlag) return;
    const t = setTimeout(() => setTimedOutFlag(true), HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [locHydrated, settingsHydrated, prayerHydrated, timedOutFlag]);

  useEffect(() => {
    if (!timedOut) return;
    logger.warn('hydration-timeout', { locHydrated, settingsHydrated, prayerHydrated });
    useUiStore.getState().setError({ code: 'hydration-timeout' });
  }, [timedOut, locHydrated, settingsHydrated, prayerHydrated]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.bg },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
