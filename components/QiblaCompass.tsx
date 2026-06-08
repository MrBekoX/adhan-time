import { memo, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import KAABA_IMAGE from '../assets/images/kaaba.png';
import {
  ROSE_APPEAR_SNAP_MS,
  ROSE_FOLLOW_EPSILON,
  ROSE_FOLLOW_LAMBDA,
  ROSE_FOLLOW_MAX_DT_SEC,
} from '@/constants/qibla';
import { nextRoseRotation, roseFollowStep, roseSpringConfig, showAlignmentVisuals } from '@/utils/heading';

import { CompassRose } from './CompassRose';
import { colors, spacing } from './Theme';

type Props = {
  size: number;
  /**
   * Smoothed device heading in degrees (0..360). TEST/FALLBACK-ONLY: in the app, qibla.tsx always
   * supplies `headingShared` (for BOTH the native-fused and expo-location sources), so every real
   * device drives the rose through the UI-thread worklet below — not this prop. Wiring `deviceHeading`
   * without `headingShared` lands on the un-worklet'd useEffect path (jank-prone); don't.
   */
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

// Rose retarget animation (Qibla bug A2 + its regression fix). The original per-sample spring
// (critically-damped 20, no clamp) carried velocity across retargets and coasted/overshot when the
// JS stream stalled (a GC pause) — "döndürmeyi bıraktım hâlâ döndü". A2 replaced it with a
// momentum-free `withTiming(linear)`. But timing has no inertia, so on the low-end A30s — whose
// native 50Hz sendEvent churns ART GC and makes the `headingShared` cadence irregular — the rose
// visibly "stepped"/froze between late samples (the reported regression). The fix is an OVERDAMPED,
// overshoot-CLAMPED spring (roseSpringConfig, zeta=1.3): its inertia smooths the irregular cadence
// (bridging the gaps timing left bare) while zeta>1 + overshootClamping make it physically incapable
// of the coast A2 removed — inherited velocity can only decelerate TO the target, never past it. The
// native A3 throttle (same PR) additionally regularises the cadence at the source. Spec:
// docs/superpowers/specs/2026-06-04-qibla-stepping-regression-fix-design.md.
const ROSE_SPRING = roseSpringConfig();

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
  // Displayed rose angle (unbounded, shortest-arc accumulated). Driven every vsync by the
  // follow loop below on the PRIMARY path, or by the fallback spring effect on the test path.
  // Seed both from the live heading (read ONCE at mount): every tab blur unmounts QiblaCompass
  // (Body shows a placeholder until location+heading are ready again), so a fresh 0 would reset
  // the rose to North and sweep it back up to the bearing on refocus. headingShared lives in the
  // parent (QiblaScreen, never unmounts) and is JS-thread-written, so this read is cheap+current;
  // -1 = no reading yet → 0. The rose rotates by −heading.
  const [seededRose] = useState(() =>
    headingShared && headingShared.value >= 0 ? -headingShared.value : 0,
  );
  const roseRotation = useSharedValue(seededRose);
  // UI-thread accumulator for the unwrapped rose target (grows unbounded, shortest-arc).
  const roseTargetSV = useSharedValue(seededRose);
  // Wall-clock ms since THIS mount, accumulated on the UI thread — drives the appear-snap window
  // below. Deliberately a shared value, NOT frame.timeSinceFirstFrame: useFrameCallback
  // re-registers on every re-render (aligned/qiblaBearing/unreliable change), which resets
  // timeSinceFirstFrame and would re-open the snap window mid-use; this counter only resets when
  // the component actually remounts (per tab focus).
  const appearElapsedMs = useSharedValue(0);
  const haloOpacity = useSharedValue(0);
  // JS-side accumulator for the fallback (deviceHeading) path. We must NOT read
  // roseRotation.value on the JS thread to derive the next target: that read blocks on the
  // UI thread and returns a mid-tween value, so the shortest-arc baseline races and the rose
  // stutters. Keeping the unwrapped target in a ref makes each step deterministic.
  const roseTargetRef = useRef(seededRose);
  // PRIMARY rose driver: a per-vsync exponential follow (roseFollowStep) that advances the
  // displayed angle EVERY frame toward the accumulated target, so a sparse slow-rotation feed
  // becomes a smooth glide instead of freeze-then-jump. No momentum term ⇒ it can never coast
  // past the target on a stall (the A2 coast regression is impossible by construction) and it
  // is exactly frame-rate independent (identical on 60/90/120 Hz).
  //
  // ALWAYS-ON while mounted (autostart), NOT armed/disarmed per motion. The previous design
  // disarmed on convergence (setActive(false)) and re-armed on the next sample via
  // runOnJS(armFrame) — a JS-thread round-trip at EVERY motion-resume (~40-80ms). Jerky hand
  // motion (many micro-pauses → converge → disarm → re-arm) turned that into the reported cyclic
  // micro-freeze ("donuyor düzeliyor"). With the callback always running, a settled rose just
  // early-returns each vsync (a few UI-thread ops, no bridge hop) and resumes instantly on the
  // next sample. Bounded: QiblaCompass unmounts on tab blur (Body swaps it out once heading is
  // no longer 'ready'), tearing the loop down off-screen — so no idle-battery cost.
  //
  // Gated on `headingShared`: the fallback (deviceHeading/withSpring) path never updates
  // roseTargetSV, so an active follow there would drag the rose toward 0 and fight the spring.
  // The autostart flag is false without it, AND the worklet early-returns as a belt-and-braces
  // guard (the autostart arg is only read once, at mount).
  useFrameCallback((frame) => {
    if (!headingShared) return; // fallback path owns the rose via the withSpring effect below
    const dtMs = frame.timeSincePreviousFrame ?? 16.667;
    // Advance the appear clock every frame (even while idle below) so the snap window is true
    // wall-clock from mount, not "frames in which the rose happened to move".
    if (appearElapsedMs.value < ROSE_APPEAR_SNAP_MS) appearElapsedMs.value += dtMs;
    const target = roseTargetSV.value;
    const cur = roseRotation.value;
    if (Math.abs(target - cur) < ROSE_FOLLOW_EPSILON) {
      if (cur !== target) roseRotation.value = target; // snap the last sub-ε remainder, then idle
      return;
    }
    // First ~200ms after the compass (re)appears: converge INSTANTLY, don't ease. The only gap in
    // this window is a one-time discontinuity — seed vs first sample, the GPS-lock declination
    // correction, or a rotation that happened while the tab was blurred — which a snap absorbs with
    // no visible sweep. Real ongoing motion (past the window) is smooth-followed below.
    if (appearElapsedMs.value < ROSE_APPEAR_SNAP_MS) {
      roseRotation.value = target;
      return;
    }
    const dtSec = dtMs / 1000;
    // Pass the constants in: a CALLEE worklet can't reliably capture cross-module imported
    // constants into its closure (on-device ReferenceError), but THIS worklet captures them fine.
    roseRotation.value = roseFollowStep(cur, target, dtSec, ROSE_FOLLOW_LAMBDA, ROSE_FOLLOW_MAX_DT_SEC);
  }, !!headingShared);

  // PRIMARY ingest: accumulate the shortest-arc unwrapped target on the UI thread. The always-on
  // follow above picks it up on the next vsync — no per-sample arm or JS-bridge hop.
  useAnimatedReaction(
    () => headingShared?.value ?? -1,
    (heading) => {
      if (heading < 0) return; // no reading yet, or the fallback (deviceHeading) path is active
      const target = -heading;
      let delta = ((((target - roseTargetSV.value) % 360) + 540) % 360) - 180;
      if (delta <= -180) delta += 360;
      roseTargetSV.value += delta;
    },
  );

  // FALLBACK path (no shared value — e.g. unit tests): drive from the deviceHeading prop with
  // the retained overdamped, overshoot-clamped spring (the follow loop stays inactive here).
  useEffect(() => {
    if (headingShared) return; // the UI-thread follow owns the rose
    const nextTarget = nextRoseRotation(roseTargetRef.current, deviceHeading);
    roseTargetRef.current = nextTarget;
    roseRotation.value = withSpring(nextTarget, ROSE_SPRING);
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
