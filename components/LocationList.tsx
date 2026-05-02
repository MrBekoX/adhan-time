import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius, spacing } from './Theme';

export type LocationListItem = {
  id: string;
  name: string;
  nameEn: string;
};

type Props = {
  items: LocationListItem[];
  loading?: boolean;
  onSelect: (item: LocationListItem) => void;
};

export function LocationList({ items, loading, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const needle = q.trim().toLocaleLowerCase('tr');
    return items.filter((it) => {
      const name = (i18n.language === 'tr' ? it.name : it.nameEn).toLocaleLowerCase('tr');
      return name.includes(needle);
    });
  }, [items, q, i18n.language]);

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
          placeholder={t('common.search').toLowerCase()}
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
          <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={() => onSelect(item)}>
            <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={styles.rowText}>
              {i18n.language === 'tr' ? item.name : item.nameEn}
            </Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    paddingLeft: spacing.md + 4,
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
  index: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.textFaint,
    width: 32,
    letterSpacing: 0.5,
  },
  rowText: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.cream,
    letterSpacing: 0.2,
  },
  chevron: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.textFaint,
    marginLeft: spacing.sm,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSoft, marginLeft: spacing.lg + 32 },
});
