import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ModalSelectField } from '../components/ModalSelectField';
import { ScreenWithFooter } from '../components/ScreenWithFooter';
import { TransactionRow } from '../components/TransactionRow';
import * as assetTypesRepo from '../db/repositories/assetTypes';
import * as categoriesRepo from '../db/repositories/categories';
import * as pocketsRepo from '../db/repositories/pockets';
import * as settingsRepo from '../db/repositories/settings';
import * as txRepo from '../db/repositories/transactions';
import { filterForDrill, UNCATEGORIZED_FILTER } from '../domain/transactionFilter';
import type { Category, LedgerTransaction } from '../domain/types';
import type { RootStackScreenProps } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';
import { animateNextLayout } from '../utils/animateLayout';
import { HIT_SLOP } from '../utils/hitSlop';
import { assignChartColors, buildThemeChartPalette, resolveStoredColor } from '../utils/pocketChartColors';

const ALL = '__all__';
const HISTORY_PAGE_SIZE = 100;

const KIND_LABELS: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
};

function pocketLineForHistory(tx: LedgerTransaction, names: Map<string, string>): string | null {
  const n = (id: string | null) => (id ? names.get(id) ?? '…' : '…');
  if (tx.kind === 'transfer' && tx.from_pocket_id && tx.to_pocket_id) {
    return `${n(tx.from_pocket_id)} → ${n(tx.to_pocket_id)}`;
  }
  if (tx.pocket_id) return n(tx.pocket_id);
  return null;
}

/** Fills in the names of pockets a page of transactions refers to that the pocket list does not show. */
async function addMissingPocketNames(
  names: Map<string, string>,
  txs: LedgerTransaction[],
  jarId: string | null
): Promise<void> {
  const need = new Set<string>();
  for (const tx of txs) {
    if (tx.pocket_id) need.add(tx.pocket_id);
    if (tx.from_pocket_id) need.add(tx.from_pocket_id);
    if (tx.to_pocket_id) need.add(tx.to_pocket_id);
  }
  if (jarId) need.add(jarId);
  await Promise.all(
    [...need]
      .filter((id) => !names.has(id))
      .map(async (id) => {
        const p = await pocketsRepo.getPocket(id);
        names.set(id, p?.name ?? 'Unknown');
      })
  );
}

function toggleInList(list: string[], value: string, allToken = ALL): string[] {
  if (value === allToken) return [];
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function formatMultiDisplay(values: string[], labelFor: (value: string) => string): string {
  if (!values.length) return '';
  if (values.length === 1) return labelFor(values[0]);
  if (values.length === 2) return `${labelFor(values[0])}, ${labelFor(values[1])}`;
  return `${values.length} selected`;
}

export default function HistoryScreen({ navigation, route }: RootStackScreenProps<'History'>) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const chartPalette = useMemo(() => buildThemeChartPalette(colors, isDark), [colors, isDark]);
  const paramPocketId = route.params?.pocketId;
  const drill = route.params?.drill;
  const [items, setItems] = useState<LedgerTransaction[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pocketNames, setPocketNames] = useState(() => new Map<string, string>());
  const [currencyCodes, setCurrencyCodes] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryNames, setCategoryNames] = useState(
    () => new Map<string, { name: string; color: string | null }>()
  );
  const categoryFallbackColors = useMemo(
    () => assignChartColors(categories.map((c) => c.id), chartPalette),
    [categories, chartPalette]
  );
  const [jarPocketId, setJarPocketId] = useState<string | null>(null);
  const [filterLabel, setFilterLabel] = useState('');
  const [filterKinds, setFilterKinds] = useState<string[]>([]);
  const [filterCurrencies, setFilterCurrencies] = useState<string[]>([]);
  const [filterPocketIds, setFilterPocketIds] = useState<string[]>(() => (paramPocketId ? [paramPocketId] : []));
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  /** Collapsed by default — expand on demand instead of permanently occupying screen space. */
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  useEffect(() => {
    setFilterPocketIds(paramPocketId ? [paramPocketId] : []);
  }, [paramPocketId]);

  /** A single selected pocket names the screen. */
  const scopePocketId = filterPocketIds.length === 1 ? filterPocketIds[0] : null;

  /** The database filters and pages; a newer load or filter change makes an older reply stale. */
  const loadSeq = useRef(0);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const jar = await pocketsRepo.getJarPocket();
    const list = await txRepo.listTransactions({
      filter: drill
        ? filterForDrill(drill)
        : {
            kinds: filterKinds,
            currencies: filterCurrencies,
            pocketIds: filterPocketIds,
            categoryIds: filterCategoryIds,
            jarPocketId: jar?.id ?? null,
          },
      limit: HISTORY_PAGE_SIZE,
    });
    if (seq !== loadSeq.current) return;
    setItems(list);
    setHasMore(list.length === HISTORY_PAGE_SIZE);
    setJarPocketId(jar?.id ?? null);

    const cats = await categoriesRepo.listCategories();
    setCategories(cats);
    setCategoryNames(new Map(cats.map((c) => [c.id, { name: c.name, color: c.color }])));

    const types = await assetTypesRepo.listAssetTypes();
    setCurrencyCodes(types.map((t) => t.code));

    const showArchived = await settingsRepo.getShowArchivedPockets();
    const active = await pocketsRepo.listPockets(showArchived);
    const map = new Map(active.map((p) => [p.id, p.name]));
    if (jar) map.set(jar.id, jar.name);

    await addMissingPocketNames(map, list, jar?.id ?? null);
    if (seq !== loadSeq.current) return;
    setPocketNames(map);

    if (scopePocketId) {
      const p = await pocketsRepo.getPocket(scopePocketId);
      setFilterLabel(p?.name ?? 'Pocket');
    } else {
      setFilterLabel('');
    }
  }, [scopePocketId, filterKinds, filterCurrencies, filterPocketIds, filterCategoryIds, drill]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore.current) return;
    loadingMore.current = true;
    const seq = loadSeq.current;
    try {
      const page = await txRepo.listTransactions({
        filter: drill
          ? filterForDrill(drill)
          : {
              kinds: filterKinds,
              currencies: filterCurrencies,
              pocketIds: filterPocketIds,
              categoryIds: filterCategoryIds,
              jarPocketId,
            },
        limit: HISTORY_PAGE_SIZE,
        offset: items.length,
      });
      const names = new Map(pocketNames);
      await addMissingPocketNames(names, page, null);
      if (seq !== loadSeq.current) return;
      setItems((prev) => [...prev, ...page]);
      setHasMore(page.length === HISTORY_PAGE_SIZE);
      setPocketNames(names);
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : String(e));
    } finally {
      loadingMore.current = false;
    }
  }, [
    hasMore,
    items.length,
    jarPocketId,
    pocketNames,
    filterKinds,
    filterCurrencies,
    filterPocketIds,
    filterCategoryIds,
    drill,
  ]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => {
        Alert.alert('Could not load', e instanceof Error ? e.message : String(e));
      });
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: scopePocketId ? `History · ${filterLabel || '…'}` : 'History',
    });
  }, [navigation, scopePocketId, filterLabel]);

  /** Sourced from the full asset/pocket catalogs, not from `items` — `items` can be server-scoped
   *  down to a single pocket's transactions (see `scopePocketId` above), and deriving these options
   *  from that narrowed batch made everything else disappear from the picker as soon as one pocket
   *  was selected. */
  const currencyOptions = useMemo(
    () => [...currencyCodes].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [currencyCodes]
  );

  const pocketFilterOptions = useMemo(() => {
    return [...pocketNames.entries()]
      .map(([id, name]) => ({
        id,
        name,
        subtitle: id === jarPocketId ? 'Jar' : undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [pocketNames, jarPocketId]);

  const kindModalOptions = useMemo(
    () => [
      { value: ALL, title: 'All types' },
      { value: 'income', title: 'Income', subtitle: 'Includes deposits and transfers into the Jar' },
      { value: 'expense', title: 'Expense' },
      { value: 'transfer', title: 'Transfer' },
    ],
    []
  );

  const currencyModalOptions = useMemo(
    () => [
      { value: ALL, title: 'All assets' },
      ...currencyOptions.map((c) => ({ value: c, title: c })),
    ],
    [currencyOptions]
  );

  const pocketModalOptions = useMemo(
    () => [
      { value: ALL, title: 'All pockets' },
      ...pocketFilterOptions.map((p) => ({
        value: p.id,
        title: p.name,
        subtitle: p.subtitle,
      })),
    ],
    [pocketFilterOptions]
  );

  const categoryModalOptions = useMemo(
    () => [
      { value: ALL, title: 'All categories' },
      { value: UNCATEGORIZED_FILTER, title: 'Uncategorized' },
      ...categories.map((c) => ({ value: c.id, title: c.name })),
    ],
    [categories]
  );

  const kindDisplay = formatMultiDisplay(filterKinds, (k) => KIND_LABELS[k] ?? k);
  const currencyDisplay = formatMultiDisplay(filterCurrencies, (c) => c);
  const pocketDisplay = formatMultiDisplay(
    filterPocketIds,
    (id) => pocketNames.get(id) ?? 'Pocket'
  );
  const categoryDisplay = formatMultiDisplay(filterCategoryIds, (id) =>
    id === UNCATEGORIZED_FILTER ? 'Uncategorized' : (categoryNames.get(id)?.name ?? 'Category')
  );

  const hasActiveFilters =
    filterKinds.length > 0 ||
    filterCurrencies.length > 0 ||
    filterPocketIds.length > 0 ||
    filterCategoryIds.length > 0;

  const clearFilters = () => {
    setFilterKinds([]);
    setFilterCurrencies([]);
    setFilterPocketIds([]);
    setFilterCategoryIds([]);
  };

  /** Compact summary shown while the panel is collapsed — one removable chip per active dimension. */
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (filterKinds.length) {
      chips.push({ key: 'kind', label: `Type: ${kindDisplay}`, onClear: () => setFilterKinds([]) });
    }
    if (filterCurrencies.length) {
      chips.push({
        key: 'currency',
        label: `Asset: ${currencyDisplay}`,
        onClear: () => setFilterCurrencies([]),
      });
    }
    if (filterPocketIds.length) {
      chips.push({
        key: 'pocket',
        label: `Pocket: ${pocketDisplay}`,
        onClear: () => setFilterPocketIds([]),
      });
    }
    if (filterCategoryIds.length) {
      chips.push({
        key: 'category',
        label: `Category: ${categoryDisplay}`,
        onClear: () => setFilterCategoryIds([]),
      });
    }
    return chips;
  }, [
    filterKinds,
    filterCurrencies,
    filterPocketIds,
    filterCategoryIds,
    kindDisplay,
    currencyDisplay,
    pocketDisplay,
    categoryDisplay,
  ]);

  const toggleFiltersExpanded = () => {
    animateNextLayout();
    setFiltersExpanded((v) => !v);
  };

  const handleKindTap = (v: string) => {
    setFilterKinds(v === ALL ? [] : [v]);
  };
  const handleCurrencyTap = (v: string) => {
    setFilterCurrencies(v === ALL ? [] : [v]);
  };
  const handlePocketTap = (v: string) => {
    setFilterPocketIds(v === ALL ? [] : [v]);
  };
  const handleCategoryTap = (v: string) => {
    setFilterCategoryIds(v === ALL ? [] : [v]);
  };

  return (
    <ScreenWithFooter>
    <View style={styles.container}>
      {drill ? (
        <View style={[styles.filterSection, styles.drillRow]}>
          <Text style={styles.drillLabel} numberOfLines={2}>
            {drill.label}
          </Text>
          <Pressable
            hitSlop={HIT_SLOP}
            onPress={() => navigation.setParams({ drill: undefined })}
            style={styles.summaryChipRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove filter ${drill.label}`}
          >
            <Text style={styles.summaryChipRemoveText} accessibilityElementsHidden importantForAccessibility="no">
              ×
            </Text>
          </Pressable>
        </View>
      ) : (
      <View style={styles.filterSection}>
        <Pressable style={styles.filterHeaderRow} onPress={toggleFiltersExpanded}>
          <Text style={styles.filterSectionTitle}>
            Filters{activeFilterChips.length ? ` · ${activeFilterChips.length}` : ''}
          </Text>
          <Text style={styles.filterChevron}>{filtersExpanded ? '▴' : '▾'}</Text>
        </Pressable>

        {!filtersExpanded && activeFilterChips.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.summaryChipRow}
          >
            {activeFilterChips.map((chip) => (
              <Pressable
                key={chip.key}
                style={styles.summaryChip}
                onPress={toggleFiltersExpanded}
                accessibilityRole="button"
                accessibilityLabel={`Filter: ${chip.label}. Open filters`}
              >
                <Text style={styles.summaryChipText} numberOfLines={1}>
                  {chip.label}
                </Text>
                <Pressable
                  hitSlop={HIT_SLOP}
                  onPress={chip.onClear}
                  style={styles.summaryChipRemove}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove filter ${chip.label}`}
                >
                  <Text style={styles.summaryChipRemoveText} accessibilityElementsHidden importantForAccessibility="no">
                    ×
                  </Text>
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {filtersExpanded ? (
        <>
        {hasActiveFilters ? (
          <Pressable
            onPress={clearFilters}
            hitSlop={HIT_SLOP}
            style={styles.clearRow}
            accessibilityRole="button"
          >
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        ) : null}
        <View style={styles.filterFields}>
          <View style={styles.filterCell}>
            <ModalSelectField
              compact
              accent
              multiSelect
              label="Type"
              displayValue={kindDisplay}
              placeholder="All types"
              modalTitle="Transaction type"
              options={kindModalOptions}
              selectedValues={filterKinds}
              onSelect={handleKindTap}
              onToggleValue={(v) => setFilterKinds((prev) => toggleInList(prev, v))}
            />
          </View>
          <View style={styles.filterCell}>
            <ModalSelectField
              compact
              accent
              multiSelect
              label="Asset"
              displayValue={currencyDisplay}
              placeholder="All assets"
              modalTitle="Asset"
              options={currencyModalOptions}
              selectedValues={filterCurrencies}
              onSelect={handleCurrencyTap}
              onToggleValue={(v) => setFilterCurrencies((prev) => toggleInList(prev, v))}
              emptyMessage="No assets in this list yet."
            />
          </View>
          <View style={styles.filterCell}>
            <ModalSelectField
              compact
              accent
              multiSelect
              label="Pocket"
              displayValue={pocketDisplay}
              placeholder="All pockets"
              modalTitle="Pocket"
              options={pocketModalOptions}
              selectedValues={filterPocketIds}
              onSelect={handlePocketTap}
              onToggleValue={(v) => setFilterPocketIds((prev) => toggleInList(prev, v))}
              variant="pocket"
              emptyMessage="No pockets in this list yet."
            />
          </View>
          <View style={styles.filterCell}>
            <ModalSelectField
              compact
              accent
              multiSelect
              label="Category"
              displayValue={categoryDisplay}
              placeholder="All categories"
              modalTitle="Category"
              options={categoryModalOptions}
              selectedValues={filterCategoryIds}
              onSelect={handleCategoryTap}
              onToggleValue={(v) => setFilterCategoryIds((prev) => toggleInList(prev, v))}
              emptyMessage="No categories yet."
            />
          </View>
        </View>
        </>
        ) : null}
      </View>
      )}

      <FlatList
        data={items}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.muted}>
            {drill || hasActiveFilters ? 'No transactions match these filters.' : 'No transactions yet.'}
          </Text>
        }
        renderItem={({ item }) => {
          const pocketLine = pocketLineForHistory(item, pocketNames);
          const category = item.category_id ? categoryNames.get(item.category_id) : null;
          const categoryColor = item.category_id
            ? resolveStoredColor(category?.color, chartPalette) ?? categoryFallbackColors.get(item.category_id)
            : undefined;
          return (
            <TransactionRow
              item={item}
              category={category ? { name: category.name, color: categoryColor } : undefined}
              pocketLine={pocketLine}
              pocketId={filterPocketIds.length === 1 ? filterPocketIds[0] : undefined}
              onPress={() => navigation.navigate('TransactionEditor', { transactionId: item.id })}
            />
          );
        }}
      />
    </View>
    </ScreenWithFooter>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    list: { padding: 16 },
    muted: { textAlign: 'center', color: c.textMuted, marginTop: 24 },
    filterSection: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 8,
      backgroundColor: c.chipBg,
      borderBottomWidth: 1,
      borderBottomColor: c.jarSoftBorder,
    },
    filterHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    filterSectionTitle: {
      fontSize: 13,
      fontFamily: font.semibold,
      color: c.primary,
    },
    filterChevron: {
      fontSize: 22,
      color: c.primary,
      fontFamily: font.semibold,
      lineHeight: 22,
    },
    clearRow: { marginTop: 4, alignSelf: 'flex-start' },
    clearText: {
      fontSize: 13,
      fontFamily: font.semibold,
      color: c.primary,
    },
    summaryChipRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 6,
      paddingRight: 8,
    },
    summaryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.jarSoftBorder,
      borderRadius: 20,
      paddingLeft: 12,
      paddingRight: 4,
      paddingVertical: 4,
      maxWidth: 220,
    },
    summaryChipText: { fontSize: 12, color: c.textSecondary, fontFamily: font.semibold },
    summaryChipRemove: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.chipBg,
    },
    summaryChipRemoveText: { fontSize: 13, color: c.textMuted, lineHeight: 14 },
    filterFields: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
      alignItems: 'flex-start',
    },
    filterCell: { flexBasis: '48%', flexGrow: 1, minWidth: 0 },
    drillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
    drillLabel: { flex: 1, fontSize: 13, fontFamily: font.semibold, color: c.primary },
  });
}
