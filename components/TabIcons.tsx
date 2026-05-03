import { StyleSheet, View } from 'react-native';

import { colors } from './Theme';

type Props = { color: string; focused: boolean };

const STROKE = 1.5;

export function CrescentTabIcon({ color, focused }: Props) {
  return (
    <View style={[styles.frame, { width: 22, height: 22 }]}>
      <View
        style={[
          styles.crescentRing,
          {
            borderColor: color,
            borderWidth: focused ? STROKE + 0.3 : STROKE,
          },
        ]}
      >
        <View style={styles.crescentBite} />
      </View>
    </View>
  );
}

export function KaabaTabIcon({ color, focused }: Props) {
  return (
    <View style={[styles.frame, { width: 22, height: 22 }]}>
      <View
        style={[
          styles.cube,
          {
            borderColor: color,
            borderWidth: focused ? STROKE + 0.3 : STROKE,
          },
        ]}
      >
        <View style={[styles.kiswah, { backgroundColor: color, opacity: focused ? 0.95 : 0.7 }]} />
        <View style={[styles.cubeDoor, { backgroundColor: color, opacity: focused ? 0.85 : 0.55 }]} />
      </View>
    </View>
  );
}

export function HizbStarTabIcon({ color, focused }: Props) {
  return (
    <View style={[styles.frame, { width: 22, height: 22 }]}>
      <View
        style={[
          styles.starSquare,
          { borderColor: color, borderWidth: focused ? STROKE + 0.3 : STROKE },
        ]}
      />
      <View
        style={[
          styles.starSquare,
          styles.starSquareRotated,
          { borderColor: color, borderWidth: focused ? STROKE + 0.3 : STROKE },
        ]}
      />
      {focused && <View style={[styles.starCenter, { backgroundColor: color }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },

  crescentRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  crescentBite: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: colors.bgInkBottom,
    right: -3,
    top: 1.5,
  },

  cube: {
    width: 16,
    height: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  kiswah: {
    position: 'absolute',
    top: 3,
    left: -1,
    right: -1,
    height: 1.4,
  },
  cubeDoor: {
    position: 'absolute',
    bottom: 0,
    left: 5.5,
    width: 3,
    height: 5,
  },

  starSquare: {
    position: 'absolute',
    width: 13,
    height: 13,
    backgroundColor: 'transparent',
  },
  starSquareRotated: {
    transform: [{ rotate: '45deg' }],
  },
  starCenter: {
    position: 'absolute',
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
  },
});
