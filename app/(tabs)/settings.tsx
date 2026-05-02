import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { HorizonRule } from '@/components/HorizonRule';
import { colors, fonts, radius, spacing } from '@/components/Theme';
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
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>· preferences ·</Text>
        <Text style={styles.title}>Settings</Text>
      </View>

      <Section title={t('screens.settings.city')} ordinal="i">
        <Text style={styles.value}>
          {location ? `${location.districtName}` : '—'}
        </Text>
        {location?.countryName && (
          <Text style={styles.subvalue}>{location.countryName}</Text>
        )}
        <View style={styles.spacer} />
        <Button title={t('screens.settings.changeCity')} variant="secondary" onPress={onChangeCity} />
      </Section>

      <Section title={t('screens.settings.language')} ordinal="ii">
        <Row>
          <Chip
            active={settings.locale === 'tr'}
            label="Türkçe"
            shortLabel="tr"
            onPress={() => settings.setLocale('tr')}
          />
          <Chip
            active={settings.locale === 'en'}
            label="English"
            shortLabel="en"
            onPress={() => settings.setLocale('en')}
          />
        </Row>
      </Section>

      <Section title={t('screens.settings.sound')} ordinal="iii">
        <Row>
          <Chip
            active={settings.sound === 'default'}
            label={t('screens.settings.soundDefault')}
            shortLabel="·"
            onPress={() => void onSoundChange('default')}
          />
          <Chip
            active={settings.sound === 'adhanShort'}
            label={t('screens.settings.soundAdhanShort')}
            shortLabel="♪"
            onPress={() => void onSoundChange('adhanShort')}
          />
        </Row>
      </Section>

      <Section title={t('screens.settings.enabledPrayers')} ordinal="iv">
        {PRAYER_KEYS.map((key, i) => (
          <View key={key} style={[styles.toggleRow, i < PRAYER_KEYS.length - 1 && styles.toggleRowBorder]}>
            <View style={styles.toggleLeft}>
              <View style={[styles.toggleDot, { backgroundColor: colors.prayer[key] }]} />
              <Text style={styles.toggleLabel}>{t(`prayer.${key}.title`)}</Text>
            </View>
            <Switch
              value={settings.enabledPrayers.includes(key)}
              onValueChange={() => void onTogglePrayer(key)}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={settings.enabledPrayers.includes(key) ? colors.primary : colors.cardElevated}
              ios_backgroundColor={colors.border}
            />
          </View>
        ))}
      </Section>

      <HorizonRule variant="short" marginVertical={spacing.xl} />
      <Text style={styles.version}>
        {t('screens.settings.version')} · {Constants.expoConfig?.version ?? '0.0.0'}
      </Text>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  ordinal,
}: {
  title: string;
  children: React.ReactNode;
  ordinal?: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {ordinal && <Text style={styles.sectionOrdinal}>{ordinal}.</Text>}
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionRule} />
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Chip({
  active,
  label,
  shortLabel,
  onPress,
}: {
  active: boolean;
  label: string;
  shortLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipShort, active && styles.chipShortActive]}>{shortLabel}</Text>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.lg, backgroundColor: colors.bg },
  header: { paddingBottom: spacing.lg },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.textDim,
  },
  title: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 40,
    color: colors.cream,
    letterSpacing: -0.6,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionOrdinal: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.primary,
    marginRight: spacing.sm,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.textDim,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSoft,
    marginLeft: spacing.md,
  },
  sectionBody: {},
  value: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 26,
    color: colors.cream,
    letterSpacing: -0.3,
  },
  subvalue: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textDim,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  spacer: { height: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm as unknown as number },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryGlow },
  chipPressed: { opacity: 0.7 },
  chipShort: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.textFaint,
    marginRight: spacing.sm,
  },
  chipShortActive: { color: colors.primary },
  chipLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textDim,
    letterSpacing: 0.5,
  },
  chipLabelActive: { color: colors.cream },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  toggleRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center' },
  toggleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.md,
  },
  toggleLabel: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.cream,
    letterSpacing: 0.2,
  },
  version: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textFaint,
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
