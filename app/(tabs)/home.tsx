import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountdownPill } from '@/components/CountdownPill';
import { PrayerCard } from '@/components/PrayerCard';
import { colors, spacing } from '@/components/Theme';
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

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.city}>{location?.districtName ?? ''}</Text>
      {next && <CountdownPill prayerKey={next.key} remainingMs={next.remainingMs} />}
      <View style={styles.list}>
        {today?.rows.map((r) => (
          <PrayerCard key={r.key} prayerKey={r.key} time={r.time} highlight={next?.key === r.key} />
        ))}
      </View>
      {!today && <Text style={styles.fallback}>{t('common.loading')}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg, backgroundColor: colors.bg },
  city: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  list: { marginTop: spacing.lg },
  fallback: { color: colors.textDim, textAlign: 'center', marginTop: spacing.lg },
});
