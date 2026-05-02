import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from './Theme';

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
      <TextInput
        style={styles.input}
        placeholder={t('common.search')}
        placeholderTextColor={colors.textDim}
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
      />
      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <Text style={styles.rowText}>
              {i18n.language === 'tr' ? item.name : item.nameEn}
            </Text>
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
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    margin: spacing.md,
  },
  row: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowText: { color: colors.text, fontSize: 16 },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },
});
