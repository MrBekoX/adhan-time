import { memo, useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import KAABA_IMAGE from '../assets/images/kaaba.png';
import { nextRoseRotation, roseTweenDurationMs, showAlignmentVisuals } from '@/utils/heading';

import { CompassRose } from './CompassRose';
import { colors, spacing } from './Theme';

type Props = {
  size: number;
  /** Smoothed device heading in degrees (0..360). Used only when `headingShared` is absent (tests / fallback). */
  deviceHeading?: number;
  /** Bearing from user to Kaaba in degrees (0..360). */
  qiblaBearing: number;
  /** Whether the alignment indicator should glow. */
  aligned: boolean;
  /** Whether the needle should render in the unreliable state (red, dim). */
  unreliable: boolean;
  /**
   * UI-thread heading source (degrees, -1 before the first reading). When provided, the rose
   * animates from this on the UI thread — decoupled from React's re-render cadence, which
   * janked the needle into visible "stepping" on low-end devices. Falls back to `deviceHeading`.
   */
  headingShared?: SharedValue<number>;
};

const NEEDLE_LENGTH_RATIO = 0.62;
const KAABA_MARKER_SIZE = 44;
const CENTER_DOT_SIZE = 14;
const TOP_POINTER_HEIGHT = 14;
const TOP_POINTER_WIDTH = 16;
function QiblaCompassImpl({
  size,
  deviceHeading = 0,
  qiblaBearing,
  aligned,
  unreliable,
  headingShared,
}: Props) {
  // Allow the shared value to grow unboundedly so the tween follows the shortest arc.
  // Animating between two values normalized to [0, 360) makes the rose spin almost a full
  // turn whenever the device heading crosses 0/360 (the "N seam"). By accumulating the
  // signed shortest delta to -heading instead, the visual angle stays the same (modulo 360)
  // while the tween always picks the short way around.
  const roseRotation = useSharedValue(0);
  // UI-thread accumulator for the unwrapped rose target (grows unbounded, shortest-arc).
  const roseTargetSV = useSharedValue(0);
  const haloOpacity = useSharedValue(0);
  // JS-side accumulator for the fallback (deviceHeading) path. We must NOT read
  // roseRotation.value on the JS thread to derive the next target: that read blocks on the
  // UI thread and returns a mid-tween value, so the shortest-arc baseline races and the rose
  // stutters. Keeping the unwrapped target in a ref makes each step deterministic.
  const roseTargetRef = useRef(0);

  // PRIMARY path: drive the rose on the UI thread straight from the shared heading at sensor
  // rate. The previous JS-thread path (React re-render -> prop -> useEffect -> withTiming)
  // retargeted on React's irregular commit cadence, which janks on low-end devices and made
  // the needle "step" / micro-reverse. Reacting to the shared value keeps retargeting on the
  // UI thread, independent of React jank.
  useAnimatedReaction(
    () => headingShared?.value ?? -1,
    (heading) => {
      if (heading < 0) return; // no reading yet, or the fallback (deviceHeading) path is active
      const target = -heading;
      let delta = ((((target - roseTargetSV.value) % 360) + 540) % 360) - 180;
      if (delta <= -180) delta += 360;
      roseTargetSV.value += delta;
      // Short tween bridges the ~20ms samples into one continuous UI-thread glide.
      roseRotation.value = withTiming(roseTargetSV.value, { duration: 90, easing: Easing.linear });
    },
  );

  // FALLBACK path (no shared value — e.g. unit tests): drive from the deviceHeading prop.
  useEffect(() => {
    if (headingShared) return; // the UI-thread reaction owns the rose
    const nextTarget = nextRoseRotation(roseTargetRef.current, deviceHeading);
    const delta = nextTarget - roseTargetRef.current;
    roseTargetRef.current = nextTarget;
    roseRotation.value = withTiming(nextTarget, {
      duration: roseTweenDurationMs(delta),
      easing: Easing.linear,
    });
  }, [deviceHeading, roseRotation, headingShared]);

  // SPEC-K3b: halo and ring track `aligned && !unreliable`. Without the unreliable
  // gate, an unreliable reading whose hysteresis happened to latch could still light
  // up the green halo on noise.
  const visualsOn = showAlignmentVisuals(aligned, unreliable);

  useEffect(() => {
    haloOpacity.value = withTiming(visualsOn ? 1 : 0, { duration: 250 });
  }, [visualsOn, haloOpacity]);

  const roseStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${roseRotation.value}deg` }],
  }));

  const haloStyle = useAnimatedStyle(() => ({ opacity: haloOpacity.value }));

  // Counter-rotates the Kaaba image so it stays visually upright while the parent
  // rose rotates with the device heading. Without this, the photo would tilt with
  // the rose and look "drunk" to the user.
  const counterRoseStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-roseRotation.value}deg` }],
  }));

  const radius = size / 2;
  const needleLength = radius * NEEDLE_LENGTH_RATIO;
  const needleColor = unreliable ? colors.danger : colors.primary;
  const needleColorMuted = unreliable ? colors.danger : colors.primaryDark;

  // Compute the Kaaba marker position and the needle stem geometry directly,
  // so we never rely on nested-transform anchor patterns (which can get clipped
  // when the parent has zero size on some Android RN builds).
  const rad = (qiblaBearing * Math.PI) / 180;
  const tipX = Math.sin(rad) * needleLength;
  const tipY = -Math.cos(rad) * needleLength;
  const stemThickness = 3;

  return (
    // SPEC-K8: lock the compass coordinate system to LTR even when the app is
    // running in RTL (Arabic). Cardinals (N/E/S/W) and the Kaaba marker are
    // positioned via absolute left/top math; if the layout engine mirrored
    // the subtree, east and west would swap and the qibla bearing would point
    // the wrong way.
    <View style={[styles.wrap, styles.ltrLock, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.halo,
          { width: size + 24, height: size + 24, borderRadius: (size + 24) / 2 },
          haloStyle,
        ]}
      />

      <Animated.View style={[StyleSheet.absoluteFill, roseStyle]}>
        <CompassRose size={size} />

        {/* Needle stem: a vertical bar centered on the rose mid-line, then rotated
            by qiblaBearing so it points from rose center to the Kaaba marker.
            Rotation pivots around the bar's own center, which we positioned to
            coincide with the midpoint between rose center and marker tip. */}
        <View
          style={{
            position: 'absolute',
            left: radius + tipX / 2 - stemThickness / 2,
            top: radius + tipY / 2 - needleLength / 2,
            width: stemThickness,
            height: needleLength,
            backgroundColor: needleColorMuted,
            opacity: unreliable ? 0.4 : 0.9,
            transform: [{ rotate: `${qiblaBearing}deg` }],
          }}
        />

        {/* Kaaba marker — photographic image at the needle tip. Counter-rotates the
            parent rose so the cube stays visually upright as the device turns. A thin
            gold ring fades in when aligned to reinforce the alignment halo. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: radius + tipX - KAABA_MARKER_SIZE / 2,
              top: radius + tipY - KAABA_MARKER_SIZE / 2,
              width: KAABA_MARKER_SIZE,
              height: KAABA_MARKER_SIZE,
              opacity: unreliable ? 0.55 : 1,
            },
            counterRoseStyle,
          ]}
        >
          <Image
            source={KAABA_IMAGE}
            style={styles.kaabaImage}
            resizeMode="contain"
          />
          {visualsOn && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                styles.kaabaAlignedRing,
                { borderColor: needleColor },
              ]}
              pointerEvents="none"
            />
          )}
        </Animated.View>
      </Animated.View>

      {/* Center pivot dot — does NOT rotate */}
      <View
        style={[
          styles.centerDot,
          {
            width: CENTER_DOT_SIZE,
            height: CENTER_DOT_SIZE,
            borderRadius: CENTER_DOT_SIZE / 2,
            borderColor: needleColor,
          },
        ]}
      />

      {/* Fixed top pointer — sits at the inner top edge of the compass and points
          toward the rose center. Represents the direction the phone is aiming;
          user rotates phone until the Kaaba marker reaches this pointer. */}
      <View style={styles.topPointerWrap} pointerEvents="none">
        <View style={[styles.topPointer, { borderTopColor: needleColor }]} />
      </View>
    </View>
  );
}

// Memoized: with the rose driven on the UI thread via `headingShared`, this component only
// needs to re-render when alignment/quality/bearing change — NOT on every heading sample.
// That keeps the 30Hz heading stream off the React commit path (less main-thread jank).
export const QiblaCompass = memo(QiblaCompassImpl);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginVertical: spacing.lg },
  // SPEC-K8 — see QiblaCompass return: keep absolute-positioned compass geometry
  // mathematically LTR regardless of I18nManager.forceRTL.
  ltrLock: { direction: 'ltr', writingDirection: 'ltr' },
  halo: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.primary,
    opacity: 0,
  },
  centerDot: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: colors.bg,
  },
  kaabaImage: { width: '100%', height: '100%' },
  kaabaAlignedRing: {
    borderWidth: 1.5,
    borderRadius: 4,
  },
  topPointerWrap: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  topPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: TOP_POINTER_WIDTH / 2,
    borderRightWidth: TOP_POINTER_WIDTH / 2,
    borderTopWidth: TOP_POINTER_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
