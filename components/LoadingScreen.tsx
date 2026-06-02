import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import ICON from '../assets/images/icon.png';

import { colors, fonts, radius, spacing } from './Theme';

/**
 * Branded loading screen shown by the root layout while the persisted stores hydrate
 * (replacing the previous blank dark view). It deliberately uses NO i18n / providers —
 * it renders before I18nextProvider mounts — so the wordmark is the static brand mark,
 * matching BrandRow. Reanimated runs fine here (it doesn't need GestureHandlerRootView).
 */
export function LoadingScreen() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  // Soft gold halo breathing behind the logo.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.value * 0.45,
    transform: [{ scale: 0.92 + pulse.value * 0.16 }],
  }));

  // The three dots fade in/out together as a minimal "loading" cue.
  const dotsStyle = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.55 }));

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.halo, haloStyle]} />
          <Image source={ICON} style={styles.logo} resizeMode="contain" />
        </View>

        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkLight}>adhan</Text>
          <Text style={styles.wordmarkAccent}>·time</Text>
        </Text>

        <Animated.Text style={[styles.dots, dotsStyle]}>· · ·</Animated.Text>
      </View>
    </View>
  );
}

const LOGO_SIZE = 112;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  logoWrap: {
    width: LOGO_SIZE + 48,
    height: LOGO_SIZE + 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: LOGO_SIZE + 40,
    height: LOGO_SIZE + 40,
    borderRadius: (LOGO_SIZE + 40) / 2,
    backgroundColor: colors.primaryGlow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryEdge,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: radius.xl },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.cream,
    letterSpacing: 0.4,
    marginTop: spacing.lg,
  },
  wordmarkLight: { fontStyle: 'italic', color: colors.cream },
  wordmarkAccent: { fontStyle: 'italic', color: colors.primary, letterSpacing: 0.6 },
  dots: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.primary,
    letterSpacing: 4,
    marginTop: spacing.md,
  },
});
