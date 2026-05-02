import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, PRAYER_GLYPHS, radius, spacing } from './Theme';

import type { PrayerKey } from '@/constants/prayers';

type Props = {
  prayerKey: PrayerKey;
  time: string;
  highlight?: boolean;
};

export function PrayerCard({ prayerKey, time, highlight }: Props) {
  const { t } = useTranslation();
  const accent = colors.prayer[prayerKey] ?? colors.primary;

  return (
    <View style={[styles.row, highlight && styles.rowHighlight]}>
      <View style={[styles.bar, { backgroundColor: highlight ? colors.primary : accent }]} />
      <Text style={[styles.numeral, highlight && styles.numeralHighlight]}>
        {PRAYER_GLYPHS[prayerKey]}
      </Text>
      <View style={styles.center}>
        <Text style={[styles.label, highlight && styles.labelHighlight]}>
          {t(`prayer.${prayerKey}.title`)}
        </Text>
        {highlight && <Text style={styles.activeMark}>· now approaching</Text>}
      </View>
      <Text style={[styles.time, highlight && styles.timeHighlight]}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  rowHighlight: {
    backgroundColor: colors.primaryGlow,
    borderRadius: radius.md,
    borderBottomColor: 'transparent',
    marginVertical: spacing.xxs,
  },
  bar: {
    width: 2,
    height: 22,
    borderRadius: 1,
    marginRight: spacing.md,
  },
  numeral: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.textFaint,
    width: 32,
    letterSpacing: 0.5,
  },
  numeralHighlight: { color: colors.primary },
  center: { flex: 1 },
  label: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 22,
    color: colors.cream,
    letterSpacing: -0.2,
  },
  labelHighlight: { color: colors.cream },
  activeMark: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.primary,
    marginTop: 2,
  },
  time: {
    fontFamily: fonts.serif,
    fontVariant: ['tabular-nums'],
    fontSize: 22,
    color: colors.textDim,
    letterSpacing: 1,
  },
  timeHighlight: { color: colors.primary, fontWeight: '500' },
});
