import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from './Theme';

import type { PrayerKey } from '@/constants/prayers';


type Props = {
  prayerKey: PrayerKey;
  time: string;
  highlight?: boolean;
};

export function PrayerCard({ prayerKey, time, highlight }: Props) {
  const { t } = useTranslation();
  return (
    <View style={[styles.row, highlight && styles.highlight]}>
      <Text style={[styles.label, highlight && styles.labelHighlight]}>
        {t(`prayer.${prayerKey}.title`)}
      </Text>
      <Text style={[styles.time, highlight && styles.timeHighlight]}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  highlight: {
    backgroundColor: colors.primary,
  },
  label: { color: colors.text, fontSize: 16 },
  labelHighlight: { color: '#0F172A', fontWeight: '700' },
  time: { color: colors.text, fontSize: 18, fontVariant: ['tabular-nums'] },
  timeHighlight: { color: '#0F172A', fontWeight: '700' },
});
