import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from './Theme';

type Props = {
  date?: Date;
  dateIso?: string | null;
};

export function BrandRow({ date = new Date(), dateIso }: Props) {
  const { t } = useTranslation();
  const months = t('screens.home.monthsShort', { returnObjects: true }) as string[];
  const dateLabel = dateIso ? formatDateIsoLabel(dateIso, months) : formatDateLabel(date, months);

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

function formatDateIsoLabel(dateIso: string, months: string[]): string {
  const parts = dateIso.slice(0, 10).split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (
    typeof year !== 'number' ||
    typeof month !== 'number' ||
    typeof day !== 'number' ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return formatDateLabel(new Date(), months);
  }
  return `${String(day).padStart(2, '0')} Â· ${months[month - 1]} Â· ${year}`;
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
    marginEnd: spacing.sm,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  crescentInner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.bgGreenTop,
    end: -4,
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
