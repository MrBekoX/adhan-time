import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, fonts, PRAYER_GLYPHS, radius, spacing } from './Theme';

import type { PrayerKey } from '@/constants/prayers';

type Props = {
  prayerKey: PrayerKey;
  time: string;
  highlight?: boolean;
  enabled: boolean;
  onToggle: (next: boolean) => void;
};

export function PrayerCard({ prayerKey, time, highlight, enabled, onToggle }: Props) {
  const { t } = useTranslation();
  const accent = colors.prayer[prayerKey] ?? colors.primary;
  const labelTone = enabled ? colors.cream : colors.textFaint;
  const timeTone = enabled ? (highlight ? colors.primary : colors.text) : colors.textFaint;

  return (
    <View style={[styles.row, highlight && styles.rowHighlight]}>
      <View
        style={[
          styles.bar,
          { backgroundColor: highlight ? colors.primary : accent },
          !enabled && styles.barOff,
        ]}
      />

      <Text
        style={[
          styles.numeral,
          highlight && styles.numeralHighlight,
          !enabled && styles.numeralOff,
        ]}
      >
        {PRAYER_GLYPHS[prayerKey]}
      </Text>

      <View style={styles.center}>
        <Text style={[styles.label, { color: labelTone }]}>
          {t(`prayer.${prayerKey}.title`)}
        </Text>
        {highlight && enabled && (
          <Text style={styles.activeMark}>· {t('screens.home.nowApproaching')}</Text>
        )}
      </View>

      <Text style={[styles.time, { color: timeTone }, highlight && styles.timeHighlight]}>
        {time}
      </Text>

      <View style={styles.switchWrap}>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primaryEdge }}
          thumbColor={enabled ? colors.primary : colors.textFaint}
          ios_backgroundColor={colors.border}
          style={Platform.OS === 'ios' ? styles.switchIos : styles.switchAndroid}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  rowHighlight: {
    backgroundColor: colors.primaryGlow,
    borderRadius: radius.md,
    borderBottomColor: 'transparent',
    marginVertical: spacing.xxs,
    paddingHorizontal: spacing.md,
  },
  bar: {
    width: 2,
    height: 26,
    borderRadius: 1,
    marginEnd: spacing.md,
  },
  barOff: { opacity: 0.25 },
  numeral: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.textFaint,
    width: 28,
    letterSpacing: 0.5,
  },
  numeralHighlight: { color: colors.primary },
  numeralOff: { opacity: 0.4 },
  center: { flex: 1 },
  label: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 22,
    letterSpacing: -0.2,
  },
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
    fontSize: 20,
    letterSpacing: 1,
    marginEnd: spacing.md,
  },
  timeHighlight: { fontWeight: '500' },
  switchWrap: {
    width: 44,
    alignItems: 'flex-end',
  },
  switchIos: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
  switchAndroid: { transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] },
});
