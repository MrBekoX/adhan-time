import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { HorizonRule } from '@/components/HorizonRule';
import { colors, fonts, spacing } from '@/components/Theme';
import { finalizeOnboarding } from '@/services/onboardingFinalize';
import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';

export default function Permissions() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const location = useLocationStore((s) => s.selected);
  const setOnboardingCompleted = useSettingsStore((s) => s.setOnboardingCompleted);
  const setNotificationPermissionDenied = useSettingsStore(
    (s) => s.setNotificationPermissionDenied,
  );

  const onContinue = async (): Promise<void> => {
    if (!location) return;
    const settings = useSettingsStore.getState();
    setLoading(true);
    const result = await finalizeOnboarding({
      location,
      locale: settings.locale,
      sound: settings.sound,
      enabledPrayers: settings.enabledPrayers,
    });
    setLoading(false);

    if (!result.ok) {
      Alert.alert(
        t('errors.onboardingFinalize.title'),
        t('errors.onboardingFinalize.body'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.tryAgain'), onPress: () => void onContinue() },
        ],
      );
      return;
    }

    // V5: surface the OS-level denial as a persistent banner on Home; we
    // still let the user finish onboarding so they can use the app and
    // re-enable notifications later from system Settings.
    setNotificationPermissionDenied(!result.permissionGranted);
    setOnboardingCompleted(true);
    router.replace('/(tabs)/home');
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.top}>
        <Text style={styles.eyebrow}>{t('screens.onboarding.chapterEyebrow.final')}</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.glyph}>◐</Text>
        <View style={styles.ruleWrap}>
          <HorizonRule variant="gold" marginVertical={spacing.lg} />
        </View>
        <Text style={styles.title}>{t('screens.onboarding.permissions')}</Text>
        <Text style={styles.body}>{t('screens.onboarding.permissionsBody')}</Text>

        {location && (
          <View style={styles.cityCard}>
            <Text style={styles.cityEyebrow}>{t('screens.onboarding.notificationsForCity')}</Text>
            <Text style={styles.cityName}>{location.districtName}</Text>
            <Text style={styles.cityCountry}>{location.countryName}</Text>
          </View>
        )}
      </View>

      <View style={styles.bottom}>
        <View style={styles.dotRow}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={[styles.dot, styles.dotActive]} />
        </View>
        <Button title={t('screens.onboarding.finish')} onPress={onContinue} loading={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
  },
  top: { alignItems: 'center' },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyph: {
    fontFamily: fonts.serif,
    fontSize: 36,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  ruleWrap: { width: '50%' },
  title: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 30,
    color: colors.cream,
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: -0.4,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.3,
    paddingHorizontal: spacing.lg,
  },
  cityCard: {
    marginTop: spacing.xl,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  cityEyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: spacing.xs,
  },
  cityName: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 24,
    color: colors.cream,
    letterSpacing: -0.3,
  },
  cityCountry: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textDim,
    marginTop: 2,
    letterSpacing: 0.4,
  },
  bottom: { alignItems: 'center' },
  dotRow: { flexDirection: 'row', marginBottom: spacing.lg },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderSoft,
    marginHorizontal: 4,
  },
  dotActive: { backgroundColor: colors.primary, width: 18 },
});
