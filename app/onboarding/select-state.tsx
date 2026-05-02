import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationList, type LocationListItem } from '@/components/LocationList';
import { colors, fonts, spacing } from '@/components/Theme';
import { locationCache } from '@/services/locationCache';
import { logger } from '@/utils/logger';

export default function SelectState() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ countryId: string; countryName: string }>();
  const [items, setItems] = useState<LocationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.countryId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await locationCache.states(params.countryId);
        if (cancelled) return;
        setItems(data.map((c) => ({ id: c._id, name: c.name, nameEn: c.name_en })));
      } catch (e) {
        logger.error('states fetch', { error: String(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.countryId]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>· chapter iii · {params.countryName ?? ''}</Text>
        <Text style={styles.title}>{t('screens.onboarding.selectState')}</Text>
      </View>
      <LocationList
        items={items}
        loading={loading}
        onSelect={(it) =>
          router.push({
            pathname: '/onboarding/select-district',
            params: {
              countryId: params.countryId,
              countryName: params.countryName,
              stateId: it.id,
              stateName: it.name,
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
