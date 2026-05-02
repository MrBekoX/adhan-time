import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/components/Theme';
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
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>{t('screens.onboarding.selectLanguage')}</Text>
      <Pressable style={[styles.option, current === 'tr' && styles.active]} onPress={() => choose('tr')}>
        <Text style={styles.optionText}>Türkçe</Text>
      </Pressable>
      <Pressable style={[styles.option, current === 'en' && styles.active]} onPress={() => choose('en')}>
        <Text style={styles.optionText}>English</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginVertical: spacing.lg },
  option: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  active: { borderColor: colors.primary },
  optionText: { color: colors.text, fontSize: 18 },
});
