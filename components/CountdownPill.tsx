import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from './Theme';

import type { PrayerKey } from '@/constants/prayers';

type Props = {
  prayerKey: PrayerKey;
  remainingMs: number;
};

function CountdownPillImpl({ prayerKey, remainingMs }: Props) {
  const { t } = useTranslation();
  const totalMin = Math.max(0, Math.ceil(remainingMs / 60000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const accent = colors.prayer[prayerKey] ?? colors.primary;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');

  return (
    <View style={styles.wrap}>
      <View style={[styles.accentLine, { backgroundColor: accent }]} />
      <Text style={styles.eyebrow}>· {t('screens.home.nextPrayer')} ·</Text>
      <View style={styles.timeRow}>
        <Text style={styles.numeralLg}>{hh}</Text>
        <Text style={styles.colon}>:</Text>
        <Text style={styles.numeralLg}>{mm}</Text>
      </View>
      <View style={styles.tag}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={styles.until}>
          {t('screens.home.untilPrefix') ? (
            <Text style={styles.untilDim}>{t('screens.home.untilPrefix')}</Text>
          ) : null}
          <Text style={styles.untilName}>{t(`prayer.${prayerKey}.title`)}</Text>
        </Text>
      </View>
      <Text style={styles.remainingLabel}>
        {hours > 0 ? `${t('units.hour', { count: hours })} ` : ''}
        {t('units.minute', { count: minutes })} {t('screens.home.remaining')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  accentLine: {
    width: 28,
    height: 2,
    marginBottom: spacing.md,
    opacity: 0.85,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 3.2,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: spacing.lg,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  numeralLg: {
    fontFamily: fonts.serif,
    fontSize: 96,
    color: colors.cream,
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
    lineHeight: 96,
  },
  colon: {
    fontFamily: fonts.serif,
    fontSize: 88,
    color: colors.primary,
    marginHorizontal: 4,
    lineHeight: 96,
    fontStyle: 'italic',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginEnd: spacing.sm,
  },
  until: {
    fontFamily: fonts.serif,
    fontSize: 20,
  },
  untilDim: {
    color: colors.textDim,
    fontStyle: 'italic',
  },
  untilName: {
    color: colors.cream,
    fontStyle: 'italic',
  },
  remainingLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: spacing.xs,
    letterSpacing: 1.2,
    textTransform: 'lowercase',
  },
});

// The pill only displays whole minutes (HH:MM + "n minutes remaining"), but
// useNextPrayer ticks every second to keep the prayer-transition crisp. Memoize
// with a minute-resolution comparator so the 96px numerals don't re-render 60×
// per minute — only when the displayed minute (or prayer) actually changes.
export const CountdownPill = memo(
  CountdownPillImpl,
  (prev, next) =>
    prev.prayerKey === next.prayerKey &&
    Math.ceil(prev.remainingMs / 60000) === Math.ceil(next.remainingMs / 60000),
);
