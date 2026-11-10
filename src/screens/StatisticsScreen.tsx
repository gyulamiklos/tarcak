import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BalanceTrendCard } from '../components/BalanceTrendCard';
import { MonthlyBarsChart, type MonthBars } from '../components/MonthlyBarsChart';
import { ScreenWithFooter } from '../components/ScreenWithFooter';
import { getFirstActivityAt } from '../db/repositories/monthlyStats';
import type { ReportMonth } from '../domain/monthlyReport';
import { monthOf, monthsEndingAt, shiftMonthKey, summarizeMonths, type FlowRow } from '../domain/monthlyStats';
import type { RootStackScreenProps } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';
import { formatMinorAmountForDisplay } from '../utils/formatMinor';
import { HIT_SLOP } from '../utils/hitSlop';
import { buildThemeChartPalette } from '../utils/pocketChartColors';
import { monthAbbrev, monthLongLabel, monthShortLabel, signedAmount } from './statistics/format';
import { loadFlows } from './statistics/loadFlows';
import { StatisticsChips } from './statistics/StatisticsChips';
import { setStatisticsSelection, useStatisticsSelection } from './statistics/useStatisticsSelection';

/** Months in the bar chart, and months added by "Show earlier months". */
const PAGE_MONTHS = 12;

type Loaded = {
  /** What the data belongs to; a change of asset or scope drops it. */
  selectionKey: string;
  /** Oldest first; the last one is the current month. */
  months: ReportMonth[];
  flows: FlowRow[];
  firstActivityAt: number | null;
};

export default function StatisticsScreen({ route, navigation }: RootStackScreenProps<'Statistics'>) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const chartPalette = useMemo(() => buildThemeChartPalette(colors, isDark), [colors, isDark]);
  const selection = useStatisticsSelection();
  const { ready, currency, scope, scopeKey } = selection;
  const selectionKey = `${currency ?? ''}|${scopeKey}`;

  // Home's per-asset Statistics button opens this screen on that asset.
  const initialCurrency = route.params?.initialCurrency;
  useEffect(() => {
    const code = typeof initialCurrency === 'string' ? initialCurrency.trim().toUpperCase() : '';
    if (!code) return;
    setStatisticsSelection({ currency: code });
    navigation.setParams({ initialCurrency: undefined });
  }, [initialCurrency, navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ReportExport')}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Export report"
          style={styles.headerAction}
        >
          <Text style={styles.headerActionText}>Export</Text>
        </Pressable>
      ),
    });
  }, [navigation, styles]);

  /** Bumped on every focus, so numbers edited elsewhere (History, a transaction) show up. */
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, [])
  );

  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadSeq = useRef(0);
  /** How many months the user has opened up for the current selection; a refresh reloads them all. */
  const monthCount = useRef({ selectionKey: '', count: PAGE_MONTHS });

  useEffect(() => {
    if (!ready || !currency) return;
    const seq = ++loadSeq.current;
    if (monthCount.current.selectionKey !== selectionKey) {
      monthCount.current = { selectionKey, count: PAGE_MONTHS };
    }
    const months = monthsEndingAt(monthOf(Date.now()).key, monthCount.current.count);
    setLoading(true);
    setError(false);
    void (async () => {
      try {
        const [flows, firstActivityAt] = await Promise.all([
          loadFlows(currency, scope, months),
          getFirstActivityAt(currency, scope),
        ]);
        if (seq !== loadSeq.current) return;
        setData({ selectionKey, months, flows, firstActivityAt });
      } catch {
        if (seq === loadSeq.current) setError(true);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    })();
  }, [ready, currency, scope, selectionKey, refreshKey]);

  const current = data && data.selectionKey === selectionKey ? data : null;
  const firstKey = current?.firstActivityAt != null ? monthOf(current.firstActivityAt).key : null;
  const oldestKey = current?.months[0]?.key ?? null;
  const canLoadEarlier = !!firstKey && !!oldestKey && firstKey < oldestKey;

  const loadEarlier = async () => {
    // A refresh in flight would replace the months this adds, so wait for it.
    if (!current || !currency || !oldestKey || loadingEarlier || loading) return;
    const seq = loadSeq.current;
    const months = monthsEndingAt(shiftMonthKey(oldestKey, -1), PAGE_MONTHS);
    setLoadingEarlier(true);
    try {
      const flows = await loadFlows(currency, scope, months);
      if (seq !== loadSeq.current) return;
      monthCount.current = { selectionKey, count: monthCount.current.count + PAGE_MONTHS };
      setData((prev) =>
        prev && prev.selectionKey === selectionKey
          ? { ...prev, months: [...months, ...prev.months], flows: [...flows, ...prev.flows] }
          : prev
      );
    } catch {
      if (seq === loadSeq.current) setError(true);
    } finally {
      setLoadingEarlier(false);
    }
  };

  const summaries = useMemo(
    () => (current ? summarizeMonths(current.flows, current.months.map((m) => m.key)) : new Map()),
    [current]
  );

  const currentMonthKey = current?.months[current.months.length - 1]?.key ?? null;

  const bars = useMemo((): MonthBars[] => {
    if (!current) return [];
    return current.months.slice(-PAGE_MONTHS).map((m) => {
      const s = summaries.get(m.key)!;
      // The bar lengths only need the proportions, so a float is fine here.
      return { key: m.key, label: monthAbbrev(m.key), income: Number(s.income), expense: Number(s.expense) };
    });
  }, [current, summaries]);

  /** Newest first, from the month of the first transaction in this scope on. */
  const listMonths = useMemo(() => {
    if (!current || !firstKey) return [];
    return current.months
      .map((m) => m.key)
      .filter((k) => k >= firstKey)
      .reverse();
  }, [current, firstKey]);

  const openMonth = (monthKey: string) => navigation.navigate('StatisticsMonth', { monthKey });
  const fmt = (minor: bigint) => (currency ? formatMinorAmountForDisplay(minor, currency) : '');

  const barsSummary =
    bars.length > 0
      ? `Income and expense per month, ${monthLongLabel(bars[0]!.key)} to ${monthLongLabel(bars[bars.length - 1]!.key)}. The month list below has the numbers.`
      : '';

  return (
    <ScreenWithFooter>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.inner}>
        {ready && !selection.hasAssets ? (
          <Text style={styles.muted}>Add asset types under Settings to use Statistics.</Text>
        ) : (
          <>
            <StatisticsChips selection={selection} />

            {!current && loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : error ? (
              <Text style={[styles.error, styles.block]}>Could not read the ledger. Try again.</Text>
            ) : current && current.firstActivityAt === null ? (
              <Text style={[styles.muted, styles.block]}>
                {scopeKey === 'all'
                  ? `No ${currency} transactions yet.`
                  : `No ${currency} transactions in ${selection.scopeLabel} yet.`}
              </Text>
            ) : current ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Last 12 months</Text>
                  <Text style={styles.cardSub}>{currency} · transfers not counted</Text>
                  <MonthlyBarsChart
                    months={bars}
                    incomeColor={chartPalette[1]!}
                    expenseColor={chartPalette[0]!}
                    onPressMonth={openMonth}
                    summary={barsSummary}
                  />
                </View>

                <Text style={styles.sectionLabel}>MONTHS</Text>
                <View style={styles.list}>
                  {listMonths.map((key, i) => {
                    const s = summaries.get(key)!;
                    const soFar = key === currentMonthKey ? ' (so far)' : '';
                    return (
                      <Pressable
                        key={key}
                        style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && styles.rowPressed]}
                        onPress={() => openMonth(key)}
                        accessibilityRole="button"
                        accessibilityLabel={`${monthLongLabel(key)}${soFar}, net ${signedAmount(s.net, currency!)}, income ${fmt(s.income)}, expense ${fmt(s.expense)}`}
                      >
                        <View style={styles.rowHead}>
                          <Text style={styles.rowMonth}>
                            {monthShortLabel(key)}
                            {soFar ? <Text style={styles.rowSoFar}>{soFar}</Text> : null}
                          </Text>
                          <Text style={styles.rowNet}>net {signedAmount(s.net, currency!)}</Text>
                          <Text style={styles.rowChevron}>›</Text>
                        </View>
                        <Text style={styles.rowDetail}>
                          in {fmt(s.income)} · out {fmt(s.expense)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {canLoadEarlier ? (
                  <Pressable
                    style={styles.moreBtn}
                    onPress={() => void loadEarlier()}
                    disabled={loadingEarlier || loading}
                    accessibilityRole="button"
                    accessibilityState={{ busy: loadingEarlier, disabled: loadingEarlier || loading }}
                  >
                    {loadingEarlier ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.moreText}>Show earlier months</Text>
                    )}
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {current && currency ? (
              <BalanceTrendCard currency={currency} scope={scope} refreshKey={refreshKey} />
            ) : null}
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
    headerAction: { marginRight: 6 },
    headerActionText: { color: c.primary, fontFamily: font.semibold, fontSize: 15 },
    muted: { fontSize: 14, color: c.textMuted, lineHeight: 20 },
    error: { fontSize: 14, color: c.danger, lineHeight: 20 },
    block: { marginTop: 20 },
    loading: { height: 200, justifyContent: 'center', alignItems: 'center' },
    card: {
      marginTop: 16,
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardTitle: { fontFamily: font.bold, fontSize: 17, color: c.text },
    cardSub: { fontSize: 13, color: c.textMuted, marginTop: 4, marginBottom: 12 },
    sectionLabel: { fontSize: 13, fontFamily: font.semibold, color: c.primary, marginTop: 24, marginBottom: 8 },
    list: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    row: { paddingVertical: 12, paddingHorizontal: 12 },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    rowPressed: { backgroundColor: c.surfaceMuted },
    rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    rowMonth: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: c.text },
    rowSoFar: { fontFamily: font.regular, fontSize: 13, color: c.textMuted },
    rowNet: { fontFamily: font.semibold, fontSize: 14, color: c.text },
    rowChevron: { fontSize: 18, color: c.textMuted },
    rowDetail: { fontSize: 13, color: c.textSecondary, marginTop: 4 },
    moreBtn: { paddingVertical: 14, alignItems: 'center' },
    moreText: { fontSize: 14, fontFamily: font.semibold, color: c.primary },
  });
}
