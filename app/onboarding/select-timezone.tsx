import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationList, type LocationListItem } from '@/components/LocationList';
import { colors, fonts, spacing } from '@/components/Theme';
import { COUNTRY_TZ_OPTIONS } from '@/constants/timezones';

export default function SelectTimezone() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ countryId: string; countryName: string }>();
  const opts = COUNTRY_TZ_OPTIONS[params.countryId];

  const items: LocationListItem[] =
    opts?.map((opt) => {
      const label = t(`screens.onboarding.selectTimezone.options.${opt.labelKey}`);
      return { id: opt.tz, name: label, nameEn: label };
    }) ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>· {params.countryName ?? ''} ·</Text>
        <Text style={styles.title}>{t('screens.onboarding.selectTimezone.title')}</Text>
      </View>
      <LocationList
        items={items}
        onSelect={(it) =>
          router.push({
            pathname: '/onboarding/select-state',
            params: {
              countryId: params.countryId,
              countryName: params.countryName,
              userSelectedTimezone: it.id,
            },
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
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
    fontSize: 30,
    color: colors.cream,
    marginTop: spacing.xs,
    letterSpacing: -0.4,
  },
});
