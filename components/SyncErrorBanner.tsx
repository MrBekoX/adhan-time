import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from './Theme';

import { useUiStore } from '@/store/uiStore';

type Props = {
  onRetry?: () => void;
};

export function SyncErrorBanner({ onRetry }: Props) {
  const { t } = useTranslation();
  const error = useUiStore((s) => s.lastError);
  if (!error) return null;

  // The translation file scopes user-facing banner copy under `errors.banner.*`
  // so other error namespaces (api.*, notification.*) can keep their own keys.
  const message = t([`errors.banner.${error.code}`, 'errors.unknown']);

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.message}>{message}</Text>
      <View style={styles.row}>
        {onRetry && (
          <Pressable onPress={onRetry} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <Text style={styles.btnText}>{t('common.tryAgain')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => useUiStore.getState().setError(null)}
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
        >
          <Text style={[styles.btnText, styles.btnTextGhost]}>{t('common.dismiss')}</Text>
        </Pressable>
      </View>
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
    borderColor: colors.danger,
    backgroundColor: 'rgba(224,122,107,0.12)',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.cream,
    lineHeight: 19,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  btn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    marginEnd: spacing.sm,
  },
  btnGhost: {
    borderColor: colors.borderSoft,
  },
  btnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.danger,
  },
  btnTextGhost: {
    color: colors.textDim,
  },
  pressed: {
    opacity: 0.6,
  },
});
