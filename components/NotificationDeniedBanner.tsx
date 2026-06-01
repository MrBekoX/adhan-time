import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from './Theme';

// Presentational (rules/01): the owning screen reads settingsStore and supplies
// `visible` + `onOpenSettings`, so this component imports no store.
// Tapping the action opens system settings — iOS cannot re-prompt after a
// denial, so the user has to flip the toggle there. The banner stays visible
// until requestPermission() returns true on a later attempt.
type Props = {
  visible: boolean;
  onOpenSettings: () => void;
};

export function NotificationDeniedBanner({ visible, onOpenSettings }: Props) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.message}>{t('errors.notification.permissionDenied')}</Text>
      <Pressable
        onPress={onOpenSettings}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Text style={styles.btnText}>{t('common.openSettings')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginVertical: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.cream,
    lineHeight: 19,
    letterSpacing: 0.2,
  },
  btn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  btnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  pressed: { opacity: 0.6 },
});
