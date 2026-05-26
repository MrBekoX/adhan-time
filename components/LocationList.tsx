import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius, spacing } from './Theme';

import { normalizeSearchText } from '@/utils/textCase';

export type LocationListItem = {
  id: string;
  name: string;
  nameEn: string;
  searchText?: string[];
  experimental?: boolean;
};

type Props = {
  items: LocationListItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onSelect: (item: LocationListItem) => void;
};

export function LocationList({ items, loading, error, onRetry, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const lang = i18n.language;
    const needle = normalizeSearchText(q.trim(), lang);
    return items.filter((it) => {
      const searchHaystack = [
        it.name,
        it.nameEn,
        ...(it.searchText ?? []),
      ].map((value) => normalizeSearchText(value, lang));
      return searchHaystack.some((name) => name.includes(needle));
    });
  }, [items, q, i18n.language]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorMessage}>{t('errors.api.network')}</Text>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryPressed]}
          >
            <Text style={styles.retryText}>{t('common.tryAgain')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <Text style={styles.searchGlyph}>·</Text>
        <TextInput
          style={styles.input}
          placeholder={t('common.search')}
          placeholderTextColor={colors.textFaint}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
        />
        <View style={styles.searchUnderline} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.listPad}
        renderItem={({ item, index }) => (
          <Pressable
            style={({ pressed }) => [
              styles.row,
              item.experimental && styles.rowExperimental,
              pressed && styles.rowPressed,
            ]}
            onPress={() => onSelect(item)}
          >
            <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowText}>
                {i18n.language === 'tr' ? item.name : item.nameEn}
              </Text>
              {item.experimental && (
                <Text style={styles.rowMeta}>{t('screens.onboarding.unsupportedCountry')}</Text>
              )}
            </View>
            <Text style={styles.chevron}>→</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  errorMessage: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: spacing.lg,
    letterSpacing: 0.3,
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  retryPressed: { opacity: 0.6 },
  retryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchGlyph: {
    position: 'absolute',
    left: spacing.lg,
    top: spacing.md + 6,
    color: colors.primary,
    fontSize: 18,
    fontFamily: fonts.serif,
  },
  input: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.cream,
    fontSize: 18,
    paddingStart: spacing.md + 4,
    paddingVertical: spacing.sm,
    letterSpacing: 0.3,
  },
  searchUnderline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  listPad: { paddingVertical: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  rowPressed: { backgroundColor: colors.primaryGlow, borderRadius: radius.sm },
  rowExperimental: { opacity: 0.62 },
  index: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.textFaint,
    width: 32,
    letterSpacing: 0.5,
  },
  rowCopy: { flex: 1 },
  rowText: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.cream,
    letterSpacing: 0.2,
  },
  rowMeta: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginTop: 4,
  },
  chevron: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.textFaint,
    marginStart: spacing.sm,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSoft, marginStart: spacing.lg + 32 },
});
