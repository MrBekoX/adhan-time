import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from './Theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? colors.ink : colors.primary} />
        ) : (
          <>
            {variant === 'primary' && <Text style={styles.lead}>·</Text>}
            <Text
              style={[
                styles.text,
                variant === 'primary' && styles.primaryText,
                variant === 'secondary' && styles.secondaryText,
                variant === 'ghost' && styles.ghostText,
              ]}
            >
              {title}
            </Text>
            {variant === 'primary' && <Text style={styles.lead}>·</Text>}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    marginVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.md,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.78 },
  text: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  lead: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.ink,
    marginHorizontal: spacing.sm,
    opacity: 0.6,
  },
  primaryText: { color: colors.ink },
  secondaryText: { color: colors.primary },
  ghostText: { color: colors.textDim, letterSpacing: 2 },
});
