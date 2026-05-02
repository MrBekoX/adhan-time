import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, spacing } from '@/components/Theme';
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
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.middle}>
        <Text style={styles.title}>{t('screens.onboarding.permissions')}</Text>
        <Text style={styles.body}>{t('screens.onboarding.permissionsBody')}</Text>
      </View>
      <Button title={t('screens.onboarding.finish')} onPress={onContinue} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'space-between', backgroundColor: colors.bg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.md },
  body: { fontSize: 16, color: colors.textDim, textAlign: 'center', lineHeight: 22 },
});
