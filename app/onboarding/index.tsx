import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, spacing } from '@/components/Theme';

export default function OnboardingWelcome() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.middle}>
        <Text style={styles.title}>{t('screens.onboarding.welcome')}</Text>
        <Text style={styles.body}>{t('screens.onboarding.welcomeBody')}</Text>
      </View>
      <View>
        <Button title={t('common.next')} onPress={() => router.push('/onboarding/select-language')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'space-between', backgroundColor: colors.bg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: spacing.md },
  body: { fontSize: 16, color: colors.textDim, textAlign: 'center', lineHeight: 22 },
});
