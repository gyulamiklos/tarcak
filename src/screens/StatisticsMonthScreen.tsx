import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RankedBarList, type RankedBar } from '../components/RankedBarList';
import { ScreenWithFooter } from '../components/ScreenWithFooter';
import { SegmentedControl } from '../components/SegmentedControl';
import { getFirstActivityAt, getMonthBalanceDeltas } from '../db/repositories/monthlyStats';
import type { ReportKind } from '../domain/monthlyReport';
import {
  AVERAGE_MONTHS,
  buildBreakdown,
  cumulativeBalances,
  monthFromKey,
  monthlyAverage,
  monthOf,
  monthsEndingAt,
  shiftMonthKey,
  summarizeMonths,
  type BreakdownBy,
  type FlowRow,
} from '../domain/monthlyStats';
import type { RootStackScreenProps } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';
import { formatMinorAmountForDisplay } from '../utils/formatMinor';
import { formatShare } from '../utils/formatShare';
import { HIT_SLOP } from '../utils/hitSlop';
import { assignChartColors, buildThemeChartPalette, resolveStoredColor } from '../utils/pocketChartColors';
import { monthLongLabel, monthShortLabel, signedAmount } from './statistics/format';
import { loadFlows } from './statistics/loadFlows';
import { StatisticsChips } from './statistics/StatisticsChips';
import { useStatisticsSelection } from './statistics/useStatisticsSelection';

/** Months already read for one asset and scope; stepping to a cached month needs no query. */
type MonthCache = {
  selectionKey: string;
  /** The focus the data was read on; a new focus starts over, so edits made elsewhere show. */
  refreshKey: number;
  flows: Map<string, FlowRow[]>;
  balances: Map<string, bigint>;
  firstActivityAt: number | null;
};

const KIND_LABEL: Record<ReportKind, string> = { income: 'Income', expense: 'Expense' };

const BY_OPTIONS = [
  { value: 'category', label: 'Category' },
  { value: 'pocket', label: 'Pocket' },
] as const;

export default function StatisticsMonthScreen({ route, navigation }: RootStackScreenProps<'StatisticsMonth'>) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const chartPalette = useMemo(() => buildThemeChartPalette(colors, isDark), [colors, isDark]);
  const selection = useStatisticsSelection();
  const { ready, currency, scope, scopeKey } = selection;
  const selectionKey = `${currency ?? ''}|${scopeKey}`;

  const [monthKey, setMonthKey] = useState(route.params.monthKey);
  const [kind, setKind] = useState<ReportKind>('expense');
  const [byChoice, setByChoice] = useState<BreakdownBy>('category');
  /** One pocket has nothing to split by pocket. */
  const by: BreakdownBy = scope.mode === 'pocket' ? 'category' : byChoice;

  useLayoutEffect(() => {
    navigation.setOptions({ title: monthLongLabel(monthKey) });
  }, [navigation, monthKey]);

  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, [])
  );

  const [cache, setCache] = useState<MonthCache | null>(null);
  const [error, setError] = useState(false);
  const loadSeq = useRef(0);

  useEffect(() => {
    if (!ready || !currency) return;
    const fresh = !cache || cache.selectionKey !== selectionKey || cache.refreshKey !== refreshKey;
    const known = fresh ? null : cache;
    // The month and the 12 before it (for the average); a step usually lacks one month at most.
    const missing = monthsEndingAt(monthKey, AVERAGE_MONTHS + 1).filter((m) => !known?.flows.has(m.key));
    if (missing.length === 0) return;
    const range = monthsEndingAt(missing[missing.length - 1]!.key, missing.length);
    const seq = ++loadSeq.current;
    setError(false);
    void (async () => {
      try {
        const [flows, deltas, firstActivityAt] = await Promise.all([
          loadFlows(currency, scope, range),
          getMonthBalanceDeltas(currency, scope, range),
          known ? Promise.resolve(known.firstActivityAt) : getFirstActivityAt(currency, scope),
        ]);
        if (seq !== loadSeq.current) return;
        const next: MonthCache = {
          selectionKey,
          refreshKey,
          flows: new Map(known?.flows),
          balances: new Map(known?.balances),
          firstActivityAt,
        };
        for (const m of range) next.flows.set(m.key, []);
        for (const f of flows) next.flows.get(f.month)?.push(f);
        for (const [k, v] of cumulativeBalances(range, deltas)) next.balances.set(k, v);
        setCache(next);
      } catch {
        if (seq === loadSeq.current) setError(true);
      }
    })();
  }, [ready, currency, scope, selectionKey, monthKey, refreshKey, cache]);

  const view = useMemo(() => {
    const c = cache;
    if (
      !c ||
      c.selectionKey !== selectionKey ||
      c.refreshKey !== refreshKey ||
      !c.flows.has(monthKey) ||
      !c.balances.has(monthKey)
    ) {
      return null;
    }
    const keys = [...c.flows.keys()];
    const allFlows = keys.flatMap((k) => c.flows.get(k)!);
    const summaries = summarizeMonths(allFlows, keys);
    const firstKey = c.firstActivityAt != null ? monthOf(c.firstActivityAt).key : null;
    return {
      summary: summaries.get(monthKey)!,
      monthFlows: c.flows.get(monthKey)!,
      balance: c.balances.get(monthKey)!,
      avg: {
        income: monthlyAverage(summaries, monthKey, 'income', firstKey),
        expense: monthlyAverage(summaries, monthKey, 'expense', firstKey),
      },
      firstKey,
    };
  }, [cache, selectionKey, refreshKey, monthKey]);

  const breakdown = useMemo(
    () => (view ? buildBreakdown(view.monthFlows, monthKey, kind, by) : null),
    [view, monthKey, kind, by]
  );

  const bars = useMemo((): RankedBar[] => {
    if (!breakdown || !currency) return [];
    const ids = [...breakdown.rows, ...breakdown.negative].flatMap((r) => (r.id ? [r.id] : []));
    const colorById = assignChartColors(ids, chartPalette);
    const largest = breakdown.rows[0]?.total ?? 0n;
    const positive = breakdown.rows.map((r) => ({
      key: r.id ?? '',
      name: r.name,
      amountText: formatMinorAmountForDisplay(r.total, currency),
      shareText: formatShare(r.total, breakdown.positiveTotal),
      color:
        (by === 'category' ? resolveStoredColor(r.color, chartPalette) : undefined) ??
        (r.id ? colorById.get(r.id) : undefined) ??
        colors.textMuted,
      // Three decimals of the ratio are plenty for a bar; the division itself stays BigInt.
      fraction: largest > 0n ? Number((r.total * 1000n) / largest) / 1000 : 0,
    }));
    const negative = breakdown.negative.map((r) => ({
      key: r.id ?? '',
      name: r.name,
      amountText: formatMinorAmountForDisplay(r.total, currency),
      shareText: '',
      color: null,
      fraction: 0,
    }));
    return [...positive, ...negative];
  }, [breakdown, currency, by, chartPalette, colors.textMuted]);

  /** Opens History on exactly the transactions behind one breakdown row. */
  const openRow = (rowKey: string) => {
    if (!breakdown || !currency) return;
    const row = [...breakdown.rows, ...breakdown.negative].find((r) => (r.id ?? '') === rowKey);
    if (!row) return;
    const month = monthFromKey(monthKey);
    navigation.navigate('History', {
      drill: {
        label: `${monthShortLabel(monthKey)} · ${row.name} · ${KIND_LABEL[kind]}`,
        currency,
        kind,
        fromMs: month.fromMs,
        toMs: month.toMs,
        categoryId: by === 'category' ? row.id : undefined,
        // All pockets need no pocket condition; a narrower scope names the pockets the sum came from.
        pocketIds: by === 'pocket' ? row.pocketIds : scope.mode === 'all' ? undefined : row.pocketIds,
      },
    });
  };

  const currentMonthKey = monthOf(Date.now()).key;
  const isCurrent = monthKey === currentMonthKey;
  const canPrev = !!view?.firstKey && monthKey > view.firstKey;
  const canNext = monthKey < currentMonthKey;
  const step = (delta: number) => setMonthKey(shiftMonthKey(monthKey, delta));

  const fmt = (minor: bigint) => (currency ? formatMinorAmountForDisplay(minor, currency) : '');
  const monthTitle = monthLongLabel(monthKey);

  return (
    <ScreenWithFooter>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.inner}>
        <StatisticsChips selection={selection} />

        <View style={styles.stepper}>
          <Pressable
            style={[styles.stepBtn, !canPrev && styles.stepBtnDisabled]}
            onPress={() => step(-1)}
            disabled={!canPrev}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: !canPrev }}
          >
            <Text style={styles.stepGlyph}>‹</Text>
          </Pressable>
          <Text style={styles.stepTitle} accessibilityRole="header">
            {monthTitle}
            {isCurrent ? <Text style={styles.soFar}> (so far)</Text> : null}
          </Text>
          <Pressable
            style={[styles.stepBtn, !canNext && styles.stepBtnDisabled]}
            onPress={() => step(1)}
            disabled={!canNext}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: !canNext }}
          >
            <Text style={styles.stepGlyph}>›</Text>
          </Pressable>
        </View>

        {!view || !currency ? (
          // An error only matters while there is nothing to show; a cached month stays readable.
          error ? (
            <Text style={styles.error}>Could not read the ledger. Try again.</Text>
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )
        ) : (
          <>
            <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="Show breakdown of">
              {(['income', 'expense'] as const).map((k) => {
                const selected = kind === k;
                const total = k === 'income' ? view.summary.income : -view.summary.expense;
                const avg = view.avg[k];
                const shown = signedAmount(total, currency);
                return (
                  <Pressable
                    key={k}
                    style={[styles.tile, selected && styles.tileSelected]}
                    onPress={() => setKind(k)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${KIND_LABEL[k]}, ${shown} ${currency}${avg !== null ? `, monthly average ${fmt(avg)}` : ''}`}
                  >
                    <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>
                      {KIND_LABEL[k].toUpperCase()}
                    </Text>
                    <Text style={styles.tileAmount}>{shown}</Text>
                    {avg !== null ? <Text style={styles.tileAvg}>avg {fmt(avg)}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.netLine}>
              Net {signedAmount(view.summary.net, currency)} · Balance at month end {fmt(view.balance)} {currency}
            </Text>

            <View style={styles.card}>
              <View style={styles.breakdownHead}>
                <Text style={styles.cardTitle}>
                  {KIND_LABEL[kind]} by{scope.mode === 'pocket' ? ' category' : ''}
                </Text>
                {scope.mode === 'pocket' ? null : (
                  <SegmentedControl
                    options={BY_OPTIONS}
                    value={byChoice}
                    onChange={setByChoice}
                    accessibilityLabel={`${KIND_LABEL[kind]} by`}
                  />
                )}
              </View>
              {bars.length === 0 ? (
                <Text style={styles.muted}>
                  No {kind === 'income' ? 'income' : 'expenses'} in {monthTitle}.
                </Text>
              ) : (
                <RankedBarList key={`${monthKey}|${kind}|${by}`} rows={bars} onPressRow={openRow} />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenWithFooter>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.bg },
    inner: { paddingVertical: 16, paddingHorizontal: 16, paddingBottom: 40 },
    muted: { fontSize: 14, color: c.textMuted, lineHeight: 20 },
    error: { fontSize: 14, color: c.danger, lineHeight: 20, marginTop: 20 },
    loading: { height: 200, justifyContent: 'center', alignItems: 'center' },
    stepper: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 12 },
    stepBtn: {
      width: 48,
      height: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnDisabled: { opacity: 0.45 },
    stepGlyph: { fontSize: 24, lineHeight: 28, color: c.primary, fontFamily: font.semibold },
    stepTitle: { flex: 1, textAlign: 'center', fontFamily: font.bold, fontSize: 18, color: c.text },
    soFar: { fontFamily: font.regular, fontSize: 14, color: c.textMuted },
    tiles: { flexDirection: 'row', gap: 8 },
    tile: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    tileSelected: { borderWidth: 2, borderColor: c.primary, paddingVertical: 11, paddingHorizontal: 11 },
    tileLabel: { fontSize: 12, fontFamily: font.semibold, color: c.textMuted, letterSpacing: 0.5 },
    tileLabelSelected: { color: c.primary },
    tileAmount: { fontSize: 18, fontFamily: font.bold, color: c.text, marginTop: 6 },
    tileAvg: { fontSize: 12, color: c.textMuted, marginTop: 4 },
    netLine: { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginTop: 12 },
    card: {
      marginTop: 16,
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    breakdownHead: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    cardTitle: { fontFamily: font.bold, fontSize: 17, color: c.text },
  });
}
