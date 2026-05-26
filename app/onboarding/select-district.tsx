import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationList, type LocationListItem } from '@/components/LocationList';
import { colors, fonts, spacing } from '@/components/Theme';
import { locationNameAliases } from '@/constants/locationAliases';
import { locationCache } from '@/services/locationCache';
import { resolveTimezone } from '@/services/timezoneResolver';
import { useLocationStore } from '@/store/locationStore';
import { logger } from '@/utils/logger';

export default function SelectDistrict() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    countryId: string;
    countryName: string;
    stateId: string;
    stateName: string;
    userSelectedTimezone?: string;
  }>();
  const [items, setItems] = useState<LocationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const selectLocation = useLocationStore((s) => s.selectLocation);

  const load = useCallback(
    async (signal?: { cancelled: boolean }, force = false) => {
      if (!params.stateId) return;
      setLoading(true);
      setError(false);
      try {
        const data = await locationCache.districts(params.stateId, { force });
        if (signal?.cancelled) return;
        setItems(
          data.map((c) => ({
            id: c._id,
            name: c.name,
            nameEn: c.name_en,
            searchText: locationNameAliases(c.name, c.name_en),
          })),
        );
      } catch (e) {
        logger.error('districts-fetch', { error: String(e) });
        if (!signal?.cancelled) setError(true);
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [params.stateId],
  );

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
        <Text style={styles.eyebrow}>
          {t('screens.onboarding.chapterEyebrow.iv')} {params.stateName ?? ''}
        </Text>
        <Text style={styles.title}>{t('screens.onboarding.selectDistrict')}</Text>
      </View>
      <LocationList
        items={items}
        loading={loading}
        error={error}
        onRetry={() => void load(undefined, true)}
        onSelect={(it) => {
          let tz: string;
          try {
            tz = params.userSelectedTimezone ?? resolveTimezone(params.countryId, params.stateId, it.id);
          } catch (e) {
            logger.error('timezone-resolve-failed', {
              countryId: params.countryId,
              stateId: params.stateId,
              districtId: it.id,
              error: String(e),
            });
            Alert.alert(t('errors.tzUnsupported.title'), t('errors.tzUnsupported.body', { country: it.name }));
            return;
          }
          selectLocation({
            countryId: params.countryId,
            countryName: params.countryName,
            stateId: params.stateId,
            stateName: params.stateName,
            districtId: it.id,
            districtName: it.name,
            timezone: tz,
            userSelectedTimezone: params.userSelectedTimezone,
          });
          router.push('/onboarding/permissions');
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
