import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { colors, fonts } from './Theme';

type Props = { size: number };

const TICK_COUNT = 36;
const CARDINAL_FONT_SIZE = 12;
const CARDINALS = [
  { label: 'N', deg: 0, accent: true },
  { label: 'E', deg: 90, accent: false },
  { label: 'S', deg: 180, accent: false },
  { label: 'W', deg: 270, accent: false },
] as const;

/**
 * The compass dial — ring + 36 radial ticks + N/E/S/W cardinals — drawn as ONE
 * react-native-svg `<Svg>` (a single native host view onto which every Circle/Line/Text
 * rasterises as a virtual node). This replaces the previous ~40 separate RN Views.
 *
 * WHY (render): on a Galaxy A30 the old dial sat under the rotating Animated.View, so every vsync
 * the UI thread transformed+re-recorded ~40 child views (~12 ms CPU/frame → 67% janky, 18 ms median;
 * the Home screen carrying the SAME gradient ran 8 ms). Collapsing the dial to one Svg node makes
 * the rotating group's per-frame target ~4 views. The dial depends only on `size`, so React.memo
 * renders it exactly once and the heading stream never touches it.
 *
 * WHY (hardware texture): collapsing to one Svg alone still left ~41% janky / 15 ms median on the
 * A30 (GPU only 6 ms ⇒ ~9 ms RenderThread) — the Svg's display list was re-executed every frame as
 * the parent rotated. So the static dial is wrapped in a `renderToHardwareTextureAndroid` /
 * `shouldRasterizeIOS` view: the dial rasterises ONCE to an off-screen GPU texture and the parent's
 * per-vsync rotation just re-composites that cached texture (no per-frame SVG re-raster). The prop is
 * honoured under the new architecture (Fabric, RN 0.81 — BaseViewManager promotes the view to
 * LAYER_TYPE_HARDWARE). `collapsable={false}` is REQUIRED: without it Fabric view-flattens this
 * wrapper away and the hardware-texture prop never lands on a real Android view (silent no-op). The
 * counter-rotating Kaaba marker is a sibling of <CompassRose> in QiblaCompass, OUTSIDE this wrapper,
 * so its per-frame transform can never invalidate the cache. The texture is bounded (one dial-sized
 * quad) and released automatically — QiblaCompass unmounts on tab blur.
 */
function CompassRoseImpl({ size }: Props) {
  const radius = size / 2;
  const ringWidth = StyleSheet.hairlineWidth;
  // Tick outer end sits 2px inside the ring; cardinal glyphs sit on a circle 24px inside it.
  const tickOuter = radius - 2;
  const cardinalRadius = radius - 24;

  // Point on a circle of radius `r` at `deg` measured clockwise from the top (N). The `-cos`
  // puts 0° at the top and grows the angle clockwise (screen-y points down) — the compass
  // convention used throughout the qibla UI.
  const polar = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: radius + Math.sin(rad) * r, y: radius - Math.cos(rad) * r };
  };

  return (
    <View
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      collapsable={false}
      style={{ width: size, height: size }}
    >
      <Svg
        testID="qibla-compass-dial"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        // SPEC-K8: the dial coordinate system is math-driven (sin/cos) and LTR-invariant; we still
        // flag the lock so the RTL-geometry test and the intent stay explicit.
        style={styles.ltrLock}
      >
        <Circle
          cx={radius}
          cy={radius}
          r={radius - ringWidth}
          stroke={colors.border}
          strokeWidth={ringWidth}
          fill="none"
        />
        {Array.from({ length: TICK_COUNT }).map((_, i) => {
          const angle = (360 / TICK_COUNT) * i;
          const isMajor = i % 3 === 0; // every 30° (12 of 36) is a longer, thicker major tick
          const tickLen = isMajor ? 12 : 6;
          const outer = polar(angle, tickOuter);
          const inner = polar(angle, tickOuter - tickLen);
          return (
            <Line
              key={i}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke={isMajor ? colors.border : colors.borderSoft}
              strokeWidth={isMajor ? 2 : 1}
              opacity={isMajor ? 1 : 0.6}
            />
          );
        })}
        {CARDINALS.map(({ label, deg, accent }) => {
          const p = polar(deg, cardinalRadius);
          return (
            <SvgText
              key={label}
              x={p.x}
              // Baseline nudge (⅓ of the font size) to vertically centre the glyph on the point.
              y={p.y + CARDINAL_FONT_SIZE / 3}
              fill={accent ? colors.primary : colors.textDim}
              fontFamily={fonts.sansMedium}
              fontSize={CARDINAL_FONT_SIZE}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

/**
 * Memoized on the constant `{ size }`: the dial NEVER depends on heading, so it renders once and
 * the rotating parent re-composites its single cached hardware texture every frame.
 */
export const CompassRose = memo(CompassRoseImpl);

const styles = StyleSheet.create({
  // SPEC-K8: keep the dial LTR even under I18nManager.forceRTL (Arabic) so N/E/S/W don't mirror.
  ltrLock: { direction: 'ltr', writingDirection: 'ltr' },
});
