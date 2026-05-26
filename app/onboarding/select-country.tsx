import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationList, type LocationListItem } from '@/components/LocationList';
import { colors, fonts, spacing } from '@/components/Theme';
import { COUNTRY_SEARCH_ALIASES } from '@/constants/locationAliases';
import { COUNTRIES_REQUIRING_TZ_SELECTION } from '@/constants/timezones';
import { locationCache } from '@/services/locationCache';
import { isCountrySupported } from '@/services/timezoneResolver';
import { logger } from '@/utils/logger';

export default function SelectCountry() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LocationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (signal?: { cancelled: boolean }, force = false) => {
    setLoading(true);
    setError(false);
    try {
      const data = await locationCache.countries({ force });
      if (signal?.cancelled) return;
      setItems(
        data.map((c) => ({
          id: c._id,
          name: c.name,
          nameEn: c.name_en,
          searchText: COUNTRY_SEARCH_ALIASES[c._id],
          experimental: !isCountrySupported(c._id),
        })),
      );
    } catch (e) {
      logger.error('countries-fetch', { error: String(e) });
      if (!signal?.cancelled) setError(true);
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>{t('screens.onboarding.chapterEyebrow.ii')}</Text>
        <Text style={styles.title}>{t('screens.onboarding.selectCountry')}</Text>
      </View>
      <LocationList
        items={items}
        loading={loading}
        error={error}
        onRetry={() => void load(undefined, true)}
        onSelect={(it) => {
          if (!isCountrySupported(it.id)) {
            logger.error('tz-resolver-unknown-country', { countryId: it.id, name: it.name });
            Alert.alert(
              t('errors.tzUnsupported.title'),
              t('errors.tzUnsupported.body', { country: it.name }),
            );
            return;
          }
          if (COUNTRIES_REQUIRING_TZ_SELECTION.has(it.id)) {
            router.push({
              pathname: '/onboarding/select-timezone',
              params: { countryId: it.id, countryName: it.name },
            });
            return;
          }
          router.push({
            pathname: '/onboarding/select-state',
            params: { countryId: it.id, countryName: it.name },
          });
        }}
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
