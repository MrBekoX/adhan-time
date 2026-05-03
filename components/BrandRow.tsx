import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from './Theme';

type Props = {
  date?: Date;
};

export function BrandRow({ date = new Date() }: Props) {
  const { t } = useTranslation();
  const months = t('screens.home.monthsShort', { returnObjects: true }) as string[];
  const dateLabel = formatDateLabel(date, months);

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <View style={styles.crescent}>
          <View style={styles.crescentInner} />
        </View>
        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkLight}>adhan</Text>
          <Text style={styles.wordmarkAccent}>·time</Text>
        </Text>
      </View>
      <Text style={styles.date}>{dateLabel}</Text>
    </View>
  );
}

function formatDateLabel(d: Date, months: string[]): string {
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd} · ${months[d.getMonth()]} · ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.lg,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  crescent: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  crescentInner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.bgGreenTop,
    right: -4,
    top: 1,
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 17,
    color: colors.cream,
    letterSpacing: 0.4,
  },
  wordmarkLight: { fontStyle: 'italic', color: colors.cream },
  wordmarkAccent: { fontStyle: 'italic', color: colors.primary, letterSpacing: 0.6 },
  date: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.textDim,
    textTransform: 'uppercase',
  },
});
