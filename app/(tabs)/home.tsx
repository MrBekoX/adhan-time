import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountdownPill } from '@/components/CountdownPill';
import { HorizonRule } from '@/components/HorizonRule';
import { PrayerCard } from '@/components/PrayerCard';
import { colors, fonts, spacing } from '@/components/Theme';
import { useAppLifecycle } from '@/hooks/useAppLifecycle';
import { useNextPrayer } from '@/hooks/useNextPrayer';
import { useTodayPrayers } from '@/hooks/useTodayPrayers';
import { useLocationStore } from '@/store/locationStore';

export default function Home() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const today = useTodayPrayers();
  const next = useNextPrayer();
  const location = useLocationStore((s) => s.selected);
  useAppLifecycle();

  const months = t('screens.home.monthsShort', { returnObjects: true }) as string[];
  const todayLabel = formatTodayLabel(new Date(), months);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.wordmark}>
            <Text style={styles.wordmarkLight}>adhan</Text>
            <Text style={styles.wordmarkItalic}>time</Text>
          </Text>
          <View style={styles.headerRight}>
            <Text style={styles.headerDate}>{todayLabel}</Text>
          </View>
        </View>

        <View style={styles.cityBlock}>
          <Text style={styles.cityEyebrow}>· {t('screens.home.observingFrom')} ·</Text>
          <Text style={styles.cityName}>{location?.districtName ?? '—'}</Text>
          {location?.countryName && (
            <Text style={styles.cityCountry}>{location.countryName}</Text>
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
            />
          ))}
        </View>

        {!today && (
          <View style={styles.fallbackBlock}>
            <Text style={styles.fallback}>{t('common.loading').toLowerCase()}</Text>
            <View style={styles.fallbackRule} />
          </View>
        )}

        <HorizonRule variant="short" marginVertical={spacing.xl} />
        <Text style={styles.footer}>· {t('screens.home.footerBlessing')} ·</Text>
      </ScrollView>
    </View>
  );
}

function formatTodayLabel(d: Date, months: string[]): string {
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd} · ${months[d.getMonth()]} · ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollView: { backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.lg,
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.cream,
    letterSpacing: 0.5,
  },
  wordmarkLight: { fontStyle: 'italic', color: colors.textDim },
  wordmarkItalic: { fontStyle: 'italic', color: colors.primary },
  headerRight: {},
  headerDate: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.textDim,
  },
  cityBlock: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
    fontSize: 36,
    color: colors.cream,
    letterSpacing: -0.6,
  },
  cityCountry: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textDim,
    marginTop: 2,
    letterSpacing: 0.4,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.lg,
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
    marginLeft: spacing.sm,
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
