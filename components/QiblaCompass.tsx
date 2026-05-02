import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CompassRose } from './CompassRose';
import { colors, fonts, spacing } from './Theme';

type Props = {
  size: number;
  /** Smoothed device heading in degrees (0..360, clockwise from north). */
  deviceHeading: number;
  /** Bearing from user to Kaaba in degrees (0..360). */
  qiblaBearing: number;
  /** Whether the alignment indicator should glow (|delta| < 3°). */
  aligned: boolean;
  /** Whether the needle should render in the unreliable state (red, dim). */
  unreliable: boolean;
};

const NEEDLE_LENGTH_RATIO = 0.42;

export function QiblaCompass({ size, deviceHeading, qiblaBearing, aligned, unreliable }: Props) {
  const roseRotation = useSharedValue(0);
  const haloOpacity = useSharedValue(0);

  useEffect(() => {
    roseRotation.value = withTiming(-deviceHeading, { duration: 80 });
  }, [deviceHeading, roseRotation]);

  useEffect(() => {
    haloOpacity.value = withTiming(aligned ? 1 : 0, { duration: 250 });
  }, [aligned, haloOpacity]);

  const roseStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${roseRotation.value}deg` }],
  }));

  const haloStyle = useAnimatedStyle(() => ({ opacity: haloOpacity.value }));

  // The Kaaba marker rotates with the rose so it points to the qibla bearing in world space.
  // Its position relative to the rose center is fixed at (qiblaBearing) degrees from north.
  const radius = size / 2;
  const markerOffset = radius * NEEDLE_LENGTH_RATIO;
  const rad = (qiblaBearing * Math.PI) / 180;
  const markerX = Math.sin(rad) * markerOffset;
  const markerY = -Math.cos(rad) * markerOffset;

  const needleColor = unreliable ? colors.danger : colors.primary;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.halo,
          { width: size + 24, height: size + 24, borderRadius: (size + 24) / 2 },
          haloStyle,
        ]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, roseStyle]}>
        <CompassRose size={size} />
        <View
          style={[
            styles.kaabaMarker,
            {
              left: radius + markerX - 14,
              top: radius + markerY - 14,
              borderColor: needleColor,
              opacity: unreliable ? 0.5 : 1,
            },
          ]}
        >
          <Text style={[styles.kaabaGlyph, { color: needleColor }]}>◆</Text>
        </View>
      </Animated.View>
      <View style={[styles.centerDot, { backgroundColor: needleColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginVertical: spacing.lg },
  halo: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.primary,
    opacity: 0,
  },
  kaabaMarker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  kaabaGlyph: {
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 18,
  },
  centerDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
