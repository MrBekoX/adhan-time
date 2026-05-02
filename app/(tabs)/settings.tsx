import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, radius, spacing } from '@/components/Theme';
import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import { cancelAllPrayerNotifications } from '@/services/notificationScheduler';
import { syncYearly } from '@/services/prayerService';
import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const location = useLocationStore((s) => s.selected);

  const onSoundChange = async (sound: 'default' | 'adhanShort'): Promise<void> => {
    settings.setSound(sound);
    if (location) {
      await cancelAllPrayerNotifications();
      await syncYearly(location.districtId, location.districtName, location.timezone, { force: true });
    }
  };

  const onTogglePrayer = async (key: PrayerKey): Promise<void> => {
    settings.togglePrayer(key);
    if (location) {
      await cancelAllPrayerNotifications();
      await syncYearly(location.districtId, location.districtName, location.timezone);
    }
  };

  const onChangeCity = (): void => {
    router.push('/onboarding/select-country');
  };

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <Section title={t('screens.settings.city')}>
        <Text style={styles.value}>
          {location ? `${location.districtName}, ${location.countryName}` : '-'}
        </Text>
        <Button title={t('screens.settings.changeCity')} variant="secondary" onPress={onChangeCity} />
      </Section>

      <Section title={t('screens.settings.language')}>
        <Row>
          <Pressable
            style={[styles.chip, settings.locale === 'tr' && styles.chipActive]}
            onPress={() => settings.setLocale('tr')}
          >
            <Text style={styles.chipText}>TR</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, settings.locale === 'en' && styles.chipActive]}
            onPress={() => settings.setLocale('en')}
          >
            <Text style={styles.chipText}>EN</Text>
          </Pressable>
        </Row>
      </Section>

      <Section title={t('screens.settings.sound')}>
        <Row>
          <Pressable
            style={[styles.chip, settings.sound === 'default' && styles.chipActive]}
            onPress={() => void onSoundChange('default')}
          >
            <Text style={styles.chipText}>{t('screens.settings.soundDefault')}</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, settings.sound === 'adhanShort' && styles.chipActive]}
            onPress={() => void onSoundChange('adhanShort')}
          >
            <Text style={styles.chipText}>{t('screens.settings.soundAdhanShort')}</Text>
          </Pressable>
        </Row>
      </Section>

      <Section title={t('screens.settings.enabledPrayers')}>
        {PRAYER_KEYS.map((key) => (
          <View key={key} style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{t(`prayer.${key}.title`)}</Text>
            <Switch
              value={settings.enabledPrayers.includes(key)}
              onValueChange={() => void onTogglePrayer(key)}
            />
          </View>
        ))}
      </Section>

      <Text style={styles.version}>
        {t('screens.settings.version')}: {Constants.expoConfig?.version ?? '0.0.0'}
      </Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg },
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.textDim, fontSize: 13, marginBottom: spacing.sm, textTransform: 'uppercase' },
  value: { color: colors.text, fontSize: 16, marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardElevated,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  toggleLabel: { color: colors.text, fontSize: 16 },
  version: { color: colors.textDim, textAlign: 'center', marginTop: spacing.lg },
});
