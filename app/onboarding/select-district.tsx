import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationList, type LocationListItem } from '@/components/LocationList';
import { colors, fonts, spacing } from '@/components/Theme';
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
  }>();
  const [items, setItems] = useState<LocationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const selectLocation = useLocationStore((s) => s.selectLocation);

  useEffect(() => {
    if (!params.stateId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await locationCache.districts(params.stateId);
        if (cancelled) return;
        setItems(data.map((c) => ({ id: c._id, name: c.name, nameEn: c.name_en })));
      } catch (e) {
        logger.error('districts fetch', { error: String(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.stateId]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>· chapter iv · {params.stateName ?? ''}</Text>
        <Text style={styles.title}>{t('screens.onboarding.selectDistrict')}</Text>
      </View>
      <LocationList
        items={items}
        loading={loading}
        onSelect={(it) => {
          const tz = resolveTimezone(params.countryId, params.stateId);
          selectLocation({
            countryId: params.countryId,
            countryName: params.countryName,
            stateId: params.stateId,
            stateName: params.stateName,
            districtId: it.id,
            districtName: it.name,
            timezone: tz,
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
