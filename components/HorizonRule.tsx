import { StyleSheet, View } from 'react-native';

import { colors, spacing } from './Theme';

type Props = {
  variant?: 'full' | 'short' | 'gold';
  marginVertical?: number;
};

export function HorizonRule({ variant = 'full', marginVertical = spacing.lg }: Props) {
  if (variant === 'gold') {
    return (
      <View style={[styles.wrap, { marginVertical }]}>
        <View style={styles.goldFade} />
        <View style={styles.goldDot} />
        <View style={styles.goldFade} />
      </View>
    );
  }
  return (
    <View
      style={[
        variant === 'short' ? styles.short : styles.full,
        { marginVertical },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  full: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    width: '100%',
  },
  short: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    width: 48,
    alignSelf: 'center',
  },
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  goldFade: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.primaryDark,
    opacity: 0.55,
  },
  goldDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginHorizontal: 10,
  },
});
