import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from './Theme';

type Props = {
  bands?: number;
  topColor?: string;
  bottomColor?: string;
  ornament?: boolean;
};

function GradientCanvasImpl({
  bands = 36,
  topColor = colors.bgGreenTop,
  bottomColor = colors.bgInkBottom,
  ornament = true,
}: Props) {
  const stops = useMemo(() => buildStops(topColor, bottomColor, bands), [topColor, bottomColor, bands]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View style={styles.column}>
        {stops.map((c, i) => (
          <View key={`${c}-${i}`} style={[styles.band, { backgroundColor: c }]} />
        ))}
      </View>
      {ornament && (
        <>
          <View style={styles.glowTop} />
          <View style={styles.glowSide} />
        </>
      )}
    </View>
  );
}

/**
 * Memoized: ~38 band/glow Views with constant props. It sits in QiblaScreen, which
 * re-renders on every heading publish; without memo all bands rebuilt each publish,
 * adding to the main-thread frame drops on low-end devices. Memo renders it once.
 */
export const GradientCanvas = memo(GradientCanvasImpl);

function buildStops(top: string, bottom: string, n: number): string[] {
  const a = parseHex(top);
  const b = parseHex(bottom);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = easeInOut(i / Math.max(1, n - 1));
    out.push(toHex(mix(a, b, t)));
  }
  return out;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

type RGB = [number, number, number];

function parseHex(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function toHex([r, g, b]: RGB): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  column: { flex: 1, flexDirection: 'column' },
  band: { flex: 1 },
  glowTop: {
    position: 'absolute',
    top: -120,
    left: -80,
    right: -80,
    height: 320,
    borderRadius: 320,
    backgroundColor: colors.emeraldGlow,
    opacity: 0.9,
  },
  glowSide: {
    position: 'absolute',
    top: 80,
    right: -160,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.primaryGlow,
    opacity: 0.6,
  },
});
