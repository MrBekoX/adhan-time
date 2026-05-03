import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { CrescentTabIcon, HizbStarTabIcon, KaabaTabIcon } from '@/components/TabIcons';
import { colors, fonts } from '@/components/Theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.bgInkBottom,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 72,
          paddingTop: 12,
          paddingBottom: 14,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 10,
          letterSpacing: 2.4,
          textTransform: 'uppercase',
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: t('screens.home.today'),
          tabBarIcon: ({ color, focused }) => <CrescentTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="qibla"
        options={{
          tabBarLabel: t('screens.qibla.tabLabel'),
          tabBarIcon: ({ color, focused }) => <KaabaTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: t('screens.settings.title'),
          tabBarIcon: ({ color, focused }) => <HizbStarTabIcon color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
