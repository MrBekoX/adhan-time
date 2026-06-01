import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandRow } from '@/components/BrandRow';
import { Button } from '@/components/Button';
import { GradientCanvas } from '@/components/GradientCanvas';
import { HorizonRule } from '@/components/HorizonRule';
import { SyncErrorBanner } from '@/components/SyncErrorBanner';
import { colors, fonts, radius, spacing } from '@/components/Theme';
import { PRAYER_KEYS, type PrayerKey } from '@/constants/prayers';
import type { Locale } from '@/locales/i18n';
import { registerDeviceDetailed, unregisterDevice } from '@/services/deviceRegistry';
import { applyLocale } from '@/services/localeService';
import { cancelAllPrayerNotifications } from '@/services/notificationScheduler';
import { scheduleAfterToggle, syncYearly } from '@/services/prayerService';
import { useLocationStore } from '@/store/locationStore';
import { usePrayerStore } from '@/store/prayerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { logger } from '@/utils/logger';

const LOCALE_OPTIONS: readonly { locale: Locale; label: string; shortLabel: string }[] = [
  { locale: 'tr', label: 'Türkçe', shortLabel: 'tr' },
  { locale: 'en', label: 'English', shortLabel: 'en' },
  { locale: 'ar', label: 'العربية', shortLabel: 'ar' },
  { locale: 'zh', label: '中文', shortLabel: 'zh' },
];

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Granular selectors (rules/06): subscribing to the whole store re-renders on
  // every unrelated field change. Each value/action is selected individually.
  const locale = useSettingsStore((s) => s.locale);
  const sound = useSettingsStore((s) => s.sound);
  const enabledPrayers = useSettingsStore((s) => s.enabledPrayers);
  const setSound = useSettingsStore((s) => s.setSound);
  const togglePrayer = useSettingsStore((s) => s.togglePrayer);
  const location = useLocationStore((s) => s.selected);
  const deviceRegistrationPending = useSettingsStore((s) => s.deviceRegistrationPending);
  const lastError = useUiStore((s) => s.lastError);
  const [deleting, setDeleting] = useState(false);
  const [retryingRegistration, setRetryingRegistration] = useState(false);

  const onSoundChange = async (nextSound: 'default' | 'adhanShort'): Promise<void> => {
    setSound(nextSound);
    if (!location) return;
    try {
      await cancelAllPrayerNotifications();
      await syncYearly(location.districtId, location.districtName, location.timezone, { force: true });
    } catch (e) {
      logger.warn('settings-sound-change-failed', { sound: nextSound, error: String(e) });
      useUiStore.getState().setError({ code: 'toggle-failed' });
    }
  };

  const onTogglePrayer = async (key: PrayerKey): Promise<void> => {
    togglePrayer(key);
    if (!location) return;
    try {
      await scheduleAfterToggle(location.districtId, location.districtName, location.timezone);
    } catch (e) {
      logger.warn('settings-toggle-failed', { key, error: String(e) });
      useUiStore.getState().setError({ code: 'toggle-failed' });
    }
  };

  const onLocaleChange = async (nextLocale: Locale): Promise<void> => {
    try {
      await applyLocale(nextLocale);
    } catch (e) {
      logger.warn('settings-locale-change-failed', { locale: nextLocale, error: String(e) });
      useUiStore.getState().setError({ code: 'toggle-failed' });
    }
  };

  const onChangeCity = (): void => {
    router.push('/onboarding/select-country');
  };

  const onRetryDeviceRegistration = async (): Promise<void> => {
    if (!location) return;
    setRetryingRegistration(true);
    try {
      const result = await registerDeviceDetailed({
        districtId: location.districtId,
        districtName: location.districtName,
        countryName: location.countryName,
        timezone: location.timezone,
        locale,
        sound,
        enabledPrayers,
      });
      const ui = useUiStore.getState();
      if (result.ok) {
        useSettingsStore.getState().setDeviceRegistrationPending(false);
        const cur = ui.lastError;
        if (
          cur?.code === 'device-registration-failed' ||
          cur?.code === 'device-registration-incompatible'
        ) {
          ui.setError(null);
        }
      } else if (result.reason === 'registration-disabled') {
        useSettingsStore.getState().setDeviceRegistrationPending(false);
        const cur = ui.lastError;
        if (
          cur?.code === 'device-registration-failed' ||
          cur?.code === 'device-registration-incompatible' ||
          cur?.code === 'push-token-unavailable'
        ) {
          ui.setError(null);
        }
      } else if (result.reason === 'incompatible') {
        // Retry from Settings still hit a 4xx — the build is incompatible
        // with the edge function. Drop pending so the section disappears
        // (incompatible banner takes over).
        useSettingsStore.getState().setDeviceRegistrationPending(false);
        ui.setError({
          code: 'device-registration-incompatible',
          data: { status: result.status },
        });
      } else {
        ui.setError({ code: 'device-registration-failed' });
      }
    } catch (e) {
      logger.warn('settings-retry-device-registration-failed', { error: String(e) });
      useUiStore.getState().setError({ code: 'device-registration-failed' });
    } finally {
      setRetryingRegistration(false);
    }
  };

  const performDelete = async (): Promise<void> => {
    setDeleting(true);
    let serverOk = false;
    try {
      serverOk = await unregisterDevice();
      await cancelAllPrayerNotifications();
      await AsyncStorage.clear();
      useLocationStore.getState().reset();
      useSettingsStore.getState().reset();
      usePrayerStore.getState().clear();
    } catch (e) {
      logger.warn('settings-delete-account-failed', { error: String(e) });
    } finally {
      setDeleting(false);
    }
    if (!serverOk) {
      Alert.alert(t('screens.settings.deleteAccountFailed'));
    }
    router.replace('/onboarding/select-language');
  };

  const onDeleteAccount = (): void => {
    Alert.alert(
      t('screens.settings.deleteAccountTitle'),
      t('screens.settings.deleteAccountBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void performDelete();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <GradientCanvas />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <BrandRow />
        <SyncErrorBanner
          error={lastError}
          onRetry={() => void onRetryDeviceRegistration()}
          onDismiss={() => useUiStore.getState().setError(null)}
        />

        <View style={styles.pageHead}>
          <View style={styles.cityRule} />
          <Text style={styles.eyebrow}>{t('screens.settings.preferences')}</Text>
          <Text style={styles.title}>{t('screens.settings.title')}</Text>
        </View>

        <HorizonRule variant="gold" marginVertical={spacing.lg} />

        <Section title={t('screens.settings.city')} ordinal="i">
          <Text style={styles.value}>{location ? `${location.districtName}` : '—'}</Text>
          {location?.countryName && (
            <Text style={styles.subvalue}>{location.countryName}</Text>
          )}
          <View style={styles.spacer} />
          <Button title={t('screens.settings.changeCity')} variant="secondary" onPress={onChangeCity} />
        </Section>

        <Section title={t('screens.settings.language')} ordinal="ii">
          <Row>
            {LOCALE_OPTIONS.map((opt) => (
              <Chip
                key={opt.locale}
                active={locale === opt.locale}
                label={opt.label}
                shortLabel={opt.shortLabel}
                onPress={() => void onLocaleChange(opt.locale)}
              />
            ))}
          </Row>
        </Section>

        <Section title={t('screens.settings.sound')} ordinal="iii">
          <Row>
            <Chip
              active={sound === 'default'}
              label={t('screens.settings.soundDefault')}
              shortLabel="·"
              onPress={() => void onSoundChange('default')}
            />
            <Chip
              active={sound === 'adhanShort'}
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
                value={enabledPrayers.includes(key)}
                onValueChange={() => void onTogglePrayer(key)}
                trackColor={{ false: colors.border, true: colors.primaryDark }}
                thumbColor={enabledPrayers.includes(key) ? colors.primary : colors.cardElevated}
                ios_backgroundColor={colors.border}
              />
            </View>
          ))}
        </Section>

        {deviceRegistrationPending && (
          <Section title={t('screens.settings.deviceRegistration')} ordinal="v">
            <Text style={styles.subvalue}>
              {t('screens.settings.deviceRegistrationFailedHint')}
            </Text>
            <View style={styles.spacer} />
            <Button
              title={
                retryingRegistration
                  ? t('screens.settings.retryingDeviceRegistration')
                  : t('screens.settings.retryDeviceRegistration')
              }
              variant="secondary"
              onPress={() => void onRetryDeviceRegistration()}
              disabled={retryingRegistration || !location}
            />
          </Section>
        )}

        <Section
          title={t('screens.settings.privacy')}
          ordinal={deviceRegistrationPending ? 'vi' : 'v'}
        >
          <Button
            title={deleting ? t('screens.settings.deleteAccountInProgress') : t('screens.settings.deleteAccount')}
            variant="secondary"
            onPress={onDeleteAccount}
            disabled={deleting}
          />
        </Section>

        <HorizonRule variant="short" marginVertical={spacing.xl} />
        <Text style={styles.version}>
          {t('screens.settings.version')} · {Constants.expoConfig?.version ?? '0.0.0'}
        </Text>
      </ScrollView>
    </View>
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
  root: { flex: 1, backgroundColor: colors.bg },
  scrollView: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: spacing.lg },

  pageHead: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  cityRule: {
    width: 28,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.primary,
    opacity: 0.7,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 38,
    color: colors.cream,
    letterSpacing: -0.6,
    lineHeight: 42,
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
    marginEnd: spacing.sm,
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
    marginStart: spacing.md,
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
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginEnd: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryGlow },
  chipPressed: { opacity: 0.7 },
  chipShort: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.textFaint,
    marginEnd: spacing.sm,
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
    marginEnd: spacing.md,
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
