import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { HorizonRule } from '@/components/HorizonRule';
import { colors, fonts, spacing } from '@/components/Theme';

export default function OnboardingWelcome() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.top}>
        <Text style={styles.eyebrow}>· {t('screens.onboarding.est')} ·</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.glyph}>⌒</Text>
        <Text style={styles.wordmarkSans}>ADHAN</Text>
        <Text style={styles.wordmarkSerif}>time</Text>

        <View style={styles.ruleWrap}>
          <HorizonRule variant="gold" marginVertical={spacing.lg} />
        </View>

        <Text style={styles.welcome}>{t('screens.onboarding.welcome')}</Text>
        <Text style={styles.body}>{t('screens.onboarding.welcomeBody')}</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.dotRow}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
        <Button title={t('common.next')} onPress={() => router.push('/onboarding/select-language')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
  },
  top: { alignItems: 'center' },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyph: {
    fontFamily: fonts.serif,
    fontSize: 32,
    color: colors.primary,
    marginBottom: spacing.lg,
    opacity: 0.85,
  },
  wordmarkSans: {
    fontFamily: fonts.sansMedium,
    fontSize: 24,
    letterSpacing: 8,
    color: colors.cream,
  },
  wordmarkSerif: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 28,
    color: colors.primary,
    letterSpacing: 1,
    marginTop: -spacing.xs,
  },
  ruleWrap: { width: '60%', marginVertical: spacing.md },
  welcome: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 26,
    color: colors.cream,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    lineHeight: 34,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.3,
    paddingHorizontal: spacing.lg,
  },
  bottom: { alignItems: 'center' },
  dotRow: { flexDirection: 'row', marginBottom: spacing.lg },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderSoft,
    marginHorizontal: 4,
  },
  dotActive: { backgroundColor: colors.primary, width: 18 },
});
