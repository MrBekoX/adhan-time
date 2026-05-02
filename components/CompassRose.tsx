import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from './Theme';

type Props = { size: number };

const CARDINALS = [
  { label: 'N', deg: 0, accent: true },
  { label: 'E', deg: 90, accent: false },
  { label: 'S', deg: 180, accent: false },
  { label: 'W', deg: 270, accent: false },
];

const TICK_COUNT = 36;

export function CompassRose({ size }: Props) {
  const radius = size / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius }]}>
      {Array.from({ length: TICK_COUNT }).map((_, i) => {
        const angle = (360 / TICK_COUNT) * i;
        const isMajor = i % 3 === 0;
        return (
          <View
            key={i}
            style={[
              styles.tick,
              isMajor ? styles.tickMajor : styles.tickMinor,
              {
                top: radius - (isMajor ? 14 : 8),
                left: radius - (isMajor ? 1 : 0.5),
                transform: [
                  { translateY: -radius + (isMajor ? 14 : 8) },
                  { rotate: `${angle}deg` },
                  { translateY: radius - (isMajor ? 14 : 8) },
                ],
              },
            ]}
          />
        );
      })}
      {CARDINALS.map(({ label, deg, accent }) => {
        const offset = radius - 24;
        const rad = (deg * Math.PI) / 180;
        const x = Math.sin(rad) * offset;
        const y = -Math.cos(rad) * offset;
        return (
          <Text
            key={label}
            style={[
              styles.cardinal,
              accent && styles.cardinalAccent,
              { left: radius + x - 10, top: radius + y - 12 },
            ]}
          >
            {label}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  tick: { position: 'absolute', backgroundColor: colors.borderSoft },
  tickMinor: { width: 1, height: 6, opacity: 0.6 },
  tickMajor: { width: 2, height: 12, backgroundColor: colors.border },
  cardinal: {
    position: 'absolute',
    width: 20,
    textAlign: 'center',
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.6,
    color: colors.textDim,
  },
  cardinalAccent: { color: colors.primary },
});
