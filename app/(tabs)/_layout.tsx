import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { colors } from '@/components/Theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('screens.home.today'),
          tabBarLabel: t('screens.home.today'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('screens.settings.title'),
          tabBarLabel: t('screens.settings.title'),
        }}
      />
    </Tabs>
  );
}
