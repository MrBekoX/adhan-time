import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { HorizonRule } from '@/components/HorizonRule';
import { colors, fonts, spacing } from '@/components/Theme';
import { registerDevice } from '@/services/deviceRegistry';
import { ensureAndroidChannel } from '@/services/notificationScheduler';
import { syncYearly } from '@/services/prayerService';
import { requestPermission } from '@/services/pushService';
import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { logger } from '@/utils/logger';

export default function Permissions() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const location = useLocationStore((s) => s.selected);
  const settings = useSettingsStore.getState();
  const setOnboardingCompleted = useSettingsStore((s) => s.setOnboardingCompleted);

  const onContinue = async (): Promise<void> => {
    if (!location) return;
    setLoading(true);
    try {
      await requestPermission();
      await ensureAndroidChannel();
      await syncYearly(location.districtId, location.districtName, location.timezone, { force: true });
      await registerDevice({
        districtId: location.districtId,
        districtName: location.districtName,
        countryName: location.countryName,
        timezone: location.timezone,
        locale: settings.locale,
        sound: settings.sound,
        enabledPrayers: settings.enabledPrayers,
      });
      setOnboardingCompleted(true);
      router.replace('/(tabs)/home');
    } catch (e) {
      logger.error('onboarding finalize', { error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.top}>
        <Text style={styles.eyebrow}>· final chapter ·</Text>
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
            <Text style={styles.cityEyebrow}>· you'll receive notifications for ·</Text>
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
