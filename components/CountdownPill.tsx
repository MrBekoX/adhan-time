import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { PrayerKey } from '@/constants/prayers';

import { colors, radius, spacing } from './Theme';

type Props = {
  prayerKey: PrayerKey;
  remainingMs: number;
};

export function CountdownPill({ prayerKey, remainingMs }: Props) {
  const { t } = useTranslation();
  const totalMin = Math.max(0, Math.floor(remainingMs / 60000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return (
    <View style={styles.pill}>
      <Text style={styles.label}>{t('screens.home.nextPrayer')}</Text>
      <Text style={styles.title}>{t(`prayer.${prayerKey}.title`)}</Text>
      <Text style={styles.remaining}>
        {hours > 0 ? `${hours}s ` : ''}
        {minutes}dk {t('screens.home.remaining')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.cardElevated,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  label: { color: colors.textDim, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colors.primary, fontSize: 32, fontWeight: '800', marginTop: spacing.xs },
  remaining: { color: colors.text, fontSize: 16, marginTop: spacing.xs },
});
