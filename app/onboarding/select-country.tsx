import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationList, type LocationListItem } from '@/components/LocationList';
import { colors, spacing } from '@/components/Theme';
import { locationCache } from '@/services/locationCache';
import { logger } from '@/utils/logger';

export default function SelectCountry() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LocationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await locationCache.countries();
        if (cancelled) return;
        setItems(data.map((c) => ({ id: c._id, name: c.name, nameEn: c.name_en })));
      } catch (e) {
        logger.error('countries fetch', { error: String(e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>{t('screens.onboarding.selectCountry')}</Text>
      <LocationList
        items={items}
        loading={loading}
        onSelect={(it) =>
          router.push({
            pathname: '/onboarding/select-state',
            params: { countryId: it.id, countryName: it.name },
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.lg },
});
