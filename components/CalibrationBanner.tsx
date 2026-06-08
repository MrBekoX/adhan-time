import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { ReliabilityReason } from '@/utils/heading';

import { colors, fonts, radius, spacing } from './Theme';

type Props = {
  /** When true, renders the unreliable variant (stronger warning copy + danger color). */
  unreliable: boolean;
  /** Why the heading is unreliable — drives a tailored recovery message (rules/11). */
  reason?: ReliabilityReason;
};

export function CalibrationBanner({ unreliable, reason }: Props) {
  const { t } = useTranslation();
  const t01 = useSharedValue(0);

  useEffect(() => {
    t01.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t01]);

  const dotStyle = useAnimatedStyle(() => {
    const x = Math.sin(t01.value * Math.PI * 2) * 12;
    const y = Math.sin(t01.value * Math.PI * 4) * 6;
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  // Magnetic interference needs a DIFFERENT action than calibration ("move away from metal" vs
  // "figure-8"), so a generic banner would mislead. Interference is always the danger variant.
  const interference = reason === 'interference';
  const accent = unreliable || interference ? colors.danger : colors.primary;
  const title = interference
    ? t('screens.qibla.interferenceTitle')
    : t('screens.qibla.calibrationTitle');
  const body = interference
    ? t('screens.qibla.interferenceBody')
    : unreliable
      ? t('screens.qibla.calibrationUnreliable')
      : t('screens.qibla.calibrationBody');

  return (
    <View style={[styles.wrap, { borderColor: accent }]}>
      <View style={styles.iconBox}>
        <Animated.View style={[styles.dot, { backgroundColor: accent }, dotStyle]} />
      </View>
      <View style={styles.textBox}>
        <Text style={[styles.title, { color: accent }]}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  textBox: { flex: 1 },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  body: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 13, color: colors.textDim },
});
