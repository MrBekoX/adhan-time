import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/components/Theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.borderSoft,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 64,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 10,
          letterSpacing: 2.4,
          textTransform: 'uppercase',
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
          tabBarIcon: ({ color }) => <TabGlyph color={color}>·</TabGlyph>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: t('screens.settings.title'),
          tabBarIcon: ({ color }) => <TabGlyph color={color}>·</TabGlyph>,
        }}
      />
    </Tabs>
  );
}

function TabGlyph({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Text style={[styles.glyph, { color }]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  glyph: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 22,
    marginTop: -2,
  },
});
