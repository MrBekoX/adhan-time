import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, spacing } from './Theme';

import { type PrayerKey } from '@/constants/prayers';

// Presentational (rules/01): the active prayer + dismiss arrive via props from
// the root layout, which owns useForegroundPrayerAlert. Shown as a top overlay
// when a prayer time arrives while the app is foregrounded (the case
// expo-notifications drops — rules/04). Reuses the existing prayer.<key>.title /
// .body strings, so no new i18n keys.
type Props = { prayerKey: PrayerKey | null; onDismiss: () => void };

export function PrayerNowBanner({ prayerKey, onDismiss }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (!prayerKey) return null;

  const accent = colors.prayer[prayerKey] ?? colors.primary;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: insets.top + spacing.sm }]}>
      <View style={[styles.banner, { borderColor: accent }]} accessibilityRole="alert">
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={styles.body}>
          <Text style={[styles.eyebrow, { color: accent }]}>{t(`prayer.${prayerKey}.title`)}</Text>
          <Text style={styles.message}>{t(`prayer.${prayerKey}.body`)}</Text>
        </View>
        <Pressable
          testID="prayer-now-dismiss"
          onPress={onDismiss}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>{t('common.dismiss')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    zIndex: 50,
    elevation: 50,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.cardElevated,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginEnd: spacing.md,
  },
  body: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  message: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.cream,
    letterSpacing: 0.2,
  },
  close: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    marginStart: spacing.sm,
  },
  closeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textDim,
  },
  pressed: { opacity: 0.6 },
});
