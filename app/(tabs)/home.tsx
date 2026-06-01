import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandRow } from '@/components/BrandRow';
import { CountdownPill } from '@/components/CountdownPill';
import { GradientCanvas } from '@/components/GradientCanvas';
import { HorizonRule } from '@/components/HorizonRule';
import { NotificationDeniedBanner } from '@/components/NotificationDeniedBanner';
import { PrayerCard } from '@/components/PrayerCard';
import { SyncErrorBanner } from '@/components/SyncErrorBanner';
import { colors, fonts, spacing } from '@/components/Theme';
import type { PrayerKey } from '@/constants/prayers';
import { runLifecycleOnce, useAppLifecycle } from '@/hooks/useAppLifecycle';
import { useNextPrayer } from '@/hooks/useNextPrayer';
import { useTodayPrayers } from '@/hooks/useTodayPrayers';
import { scheduleAfterToggle } from '@/services/prayerService';
import { useLocationStore } from '@/store/locationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { logger } from '@/utils/logger';
import { lowercaseInLocale } from '@/utils/textCase';

export default function Home() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const today = useTodayPrayers();
  const next = useNextPrayer();
  const location = useLocationStore((s) => s.selected);
  const enabledPrayers = useSettingsStore((s) => s.enabledPrayers);
  const togglePrayer = useSettingsStore((s) => s.togglePrayer);
  const notificationDenied = useSettingsStore((s) => s.notificationPermissionDenied);
  const lastError = useUiStore((s) => s.lastError);
  useAppLifecycle();

  // Stable across Home's 1s countdown tick so the memoized PrayerCards skip
  // re-rendering. Depends only on values that change on real state changes.
  const handleToggle = useCallback(
    async (key: PrayerKey): Promise<void> => {
      togglePrayer(key);
      if (!location) return;
      try {
        await scheduleAfterToggle(location.districtId, location.districtName, location.timezone);
      } catch (e) {
        logger.warn('home-toggle-reschedule-failed', { key, error: String(e) });
        useUiStore.getState().setError({ code: 'toggle-failed' });
      }
    },
    [location, togglePrayer],
  );

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
        <BrandRow dateIso={today?.dateIso} />

        <NotificationDeniedBanner
          visible={notificationDenied}
          onOpenSettings={() => void Linking.openSettings()}
        />
        <SyncErrorBanner
          error={lastError}
          onRetry={() => void runLifecycleOnce()}
          onDismiss={() => useUiStore.getState().setError(null)}
        />

        <View style={styles.cityBlock}>
          <View style={styles.cityRule} />
          <Text style={styles.cityEyebrow}>{t('screens.home.observingFrom')}</Text>
          <Text style={styles.cityName}>{location?.districtName ?? '—'}</Text>
          {location?.countryName && (
            <Text style={styles.cityCountry}>
              {lowercaseInLocale(location.countryName, i18n.language)}
            </Text>
          )}
        </View>

        {next && <CountdownPill prayerKey={next.key} remainingMs={next.remainingMs} />}

        <HorizonRule variant="gold" marginVertical={spacing.lg} />

        <View style={styles.listHeader}>
          <Text style={styles.listEyebrow}>{t('screens.home.today')}</Text>
          <Text style={styles.listEyebrowDim}>· {t('screens.home.sixStations')}</Text>
        </View>

        <View style={styles.list}>
          {today?.rows.map((r) => (
            <PrayerCard
              key={r.key}
              prayerKey={r.key}
              time={r.time}
              highlight={next?.key === r.key}
              enabled={enabledPrayers.includes(r.key)}
              onToggle={handleToggle}
            />
          ))}
        </View>

        {!today && (
          <View style={styles.fallbackBlock}>
            <Text style={styles.fallback}>{t('common.loading')}</Text>
            <View style={styles.fallbackRule} />
          </View>
        )}

        <HorizonRule variant="short" marginVertical={spacing.xl} />
        <Text style={styles.footer}>· {t('screens.home.footerBlessing')} ·</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollView: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: spacing.lg },
  cityBlock: {
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
  cityEyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: spacing.xs,
  },
  cityName: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 38,
    color: colors.cream,
    letterSpacing: -0.6,
    lineHeight: 42,
  },
  cityCountry: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 14,
    color: colors.textDim,
    marginTop: 4,
    letterSpacing: 0.6,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listEyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  listEyebrowDim: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.textFaint,
    marginStart: spacing.sm,
  },
  list: {
    marginTop: spacing.xs,
  },
  fallbackBlock: { alignItems: 'center', paddingVertical: spacing.xl },
  fallback: {
    color: colors.textDim,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 14,
    letterSpacing: 1,
  },
  fallbackRule: {
    marginTop: spacing.sm,
    width: 24,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  footer: {
    textAlign: 'center',
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.textFaint,
    letterSpacing: 1,
  },
});
