import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, spacing } from '@/components/Theme';
import { useSettingsStore } from '@/store/settingsStore';

export default function SelectLanguage() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setLocale = useSettingsStore((s) => s.setLocale);
  const current = useSettingsStore((s) => s.locale);

  const choose = (locale: 'tr' | 'en') => {
    setLocale(locale);
    router.push('/onboarding/select-country');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>· chapter i ·</Text>
        <Text style={styles.title}>{t('screens.onboarding.selectLanguage')}</Text>
      </View>

      <View style={styles.options}>
        <LanguageOption
          ordinal="i"
          label="Türkçe"
          sublabel="Turkish"
          flag="·tr"
          active={current === 'tr'}
          onPress={() => choose('tr')}
        />
        <LanguageOption
          ordinal="ii"
          label="English"
          sublabel="English"
          flag="·en"
          active={current === 'en'}
          onPress={() => choose('en')}
        />
      </View>
    </View>
  );
}

function LanguageOption({
  ordinal,
  label,
  sublabel,
  flag,
  active,
  onPress,
}: {
  ordinal: string;
  label: string;
  sublabel: string;
  flag: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        active && styles.optionActive,
        pressed && styles.optionPressed,
      ]}
    >
      <Text style={[styles.optionOrdinal, active && styles.optionOrdinalActive]}>{ordinal}.</Text>
      <View style={styles.optionMid}>
        <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
        <Text style={styles.optionSublabel}>{sublabel}</Text>
      </View>
      <Text style={[styles.optionFlag, active && styles.optionFlagActive]}>{flag}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.xl, backgroundColor: colors.bg },
  head: { paddingBottom: spacing.xl },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.textDim,
  },
  title: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 32,
    color: colors.cream,
    marginTop: spacing.xs,
    letterSpacing: -0.3,
  },
  options: { marginTop: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  optionActive: {
    backgroundColor: colors.primaryGlow,
    borderRadius: radius.md,
    borderBottomColor: 'transparent',
  },
  optionPressed: { opacity: 0.7 },
  optionOrdinal: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 14,
    color: colors.textFaint,
    width: 36,
  },
  optionOrdinalActive: { color: colors.primary },
  optionMid: { flex: 1 },
  optionLabel: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.cream,
    letterSpacing: 0.2,
  },
  optionLabelActive: { color: colors.cream, fontStyle: 'italic' },
  optionSublabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.textFaint,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  optionFlag: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 14,
    color: colors.textFaint,
    letterSpacing: 1,
  },
  optionFlagActive: { color: colors.primary },
});
