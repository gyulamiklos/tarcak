import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import {
  downsampleTimeline,
  getBalanceTimeline,
  getEarliestOccurredAt,
  type BalanceTimelinePoint,
  type StatisticsScope,
} from '../db/repositories/statistics';
import { niceStep } from '../domain/monthlyStats';
import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';
import { animateNextLayout } from '../utils/animateLayout';
import { formatAxisMajor } from '../utils/formatAxisLabel';
import { formatMinorForDisplay } from '../utils/formatMinor';
import { formatOccurredAt } from '../utils/formatOccurredAt';
import { resolveTimeRange, TimeRangePickerField, type TimeRangeValue } from './TimeRangePickerField';

/** Must match LineChart `yAxisLabelWidth` so layout math stays consistent. */
const Y_AXIS_LABEL_WIDTH = 52;
const CHART_INITIAL_SPACING = 2;
const CHART_END_SPACING = 2;

const MAX_LINE_POINTS = 72;

/** Sections above the zero line; matches the `noOfSections` passed to LineChart. */
const LINE_NO_OF_SECTIONS = 4;
/**
 * Hard cap on sections rendered below the zero line. Without an explicit `stepValue`,
 * gifted-charts derives it from `maxValue / noOfSections` and then sizes the negative area as
 * `ceil(|mostNegativeValue| / stepValue)` sections of the same height — when a deep negative dip
 * is small relative to the visible peak, that count (and the chart's total rendered height,
 * `containerHeight + noOfSectionsBelowXAxis * stepHeight`) can blow up unboundedly. Computing our
 * own `stepValue`/`maxValue`/`noOfSectionsBelowXAxis` below keeps the total height predictable.
 */
const LINE_MAX_NEG_SECTIONS = 2;

function computeLineChartScale(points: { balance_minor: number }[]) {
  const values = points.map((p) => p.balance_minor);
  const dataMax = values.length ? Math.max(0, ...values) : 0;
  const dataMin = values.length ? Math.min(0, ...values) : 0;
  if (dataMin >= 0) {
    const stepValue = niceStep(dataMax / LINE_NO_OF_SECTIONS);
    return {
      maxValue: stepValue * LINE_NO_OF_SECTIONS,
      stepValue,
      mostNegativeValue: 0,
      noOfSectionsBelowXAxis: 0,
    };
  }
  const negMagnitude = Math.abs(dataMin);
  const stepValue = niceStep(Math.max(dataMax / LINE_NO_OF_SECTIONS, negMagnitude / LINE_MAX_NEG_SECTIONS));
  const noOfSectionsBelowXAxis = Math.max(
    1,
    Math.min(LINE_MAX_NEG_SECTIONS, Math.ceil(negMagnitude / stepValue))
  );
  return {
    maxValue: stepValue * LINE_NO_OF_SECTIONS,
    stepValue,
    mostNegativeValue: dataMin,
    noOfSectionsBelowXAxis,
  };
}

/** Gifted Charts passes Y tick values as strings in the same space as `data[].value` (minor units). */
function formatYAxisMajorLabel(giftedLabel: string): string {
  return formatAxisMajor(Number(giftedLabel));
}

type ActivePoint = { ts: number; v: number };

function axisDateLabel(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

type Props = {
  currency: string;
  scope: StatisticsScope;
  /** Changes on every screen focus, so an open card reloads after edits elsewhere. */
  refreshKey: number;
};

/** "Balance over time": open by default; collapsing it stops loading the timeline. */
export function BalanceTrendCard({ currency, scope, refreshKey }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: winW } = useWindowDimensions();

  const [expanded, setExpanded] = useState(true);
  const [rangeValue, setRangeValue] = useState<TimeRangeValue>({ kind: 'preset', id: '30d' });
  /** Earliest transaction overall, for the "All time" range; read only once the card is open. */
  const [earliestMs, setEarliestMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [linePoints, setLinePoints] = useState<BalanceTimelinePoint[]>([]);
  const [rangeMeta, setRangeMeta] = useState({ startMs: 0, endMs: 0 });
  /** Measured width of the chart row (full card content width). */
  const [chartRowWidth, setChartRowWidth] = useState(0);
  /**
   * Touched chart point, shown in a fixed-position readout row instead of a floating tooltip.
   * A floating, absolutely-positioned label rendered by the chart library was getting clipped by
   * Android's ScrollView view-flattening whenever it needed to render outside its own box, no
   * matter what z-index/elevation/collapsable combination was tried — a fixed row in normal
   * layout flow can't be clipped that way since nothing needs to escape its own bounds.
   */
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);
  const activePointRef = useRef<ActivePoint | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    if (!expanded) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(false);
    activePointRef.current = null;
    setActivePoint(null);
    void (async () => {
      try {
        const earliest = await getEarliestOccurredAt();
        const { startMs, endMs } = resolveTimeRange(rangeValue, Date.now(), earliest);
        const raw = await getBalanceTimeline(currency, scope, startMs, endMs);
        if (seq !== loadSeq.current) return;
        setEarliestMs(earliest);
        setRangeMeta({ startMs, endMs });
        setLinePoints(downsampleTimeline(raw, MAX_LINE_POINTS));
      } catch {
        if (seq === loadSeq.current) setError(true);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    })();
  }, [expanded, currency, scope, rangeValue, refreshKey]);

  const lineChartData = useMemo(() => {
    if (linePoints.length === 0) return [];
    const withLabels = linePoints.map((p) => ({
      value: p.balance_minor,
      /** Carried through to pointer tooltip (library forwards the data item). */
      timestamp: p.at,
    }));
    if (withLabels.length === 1) {
      const first = withLabels[0];
      return [first, { value: first.value, timestamp: rangeMeta.endMs }];
    }
    return withLabels;
  }, [linePoints, rangeMeta.endMs]);

  /**
   * Gifted LineChart total plot width = initialSpacing + (spacing * n) + endSpacing
   * for n points (it sums one spacing per point). We solve for spacing so the line fits `lineAreaW`.
   */
  const lineLayout = useMemo(() => {
    const fallbackW = Math.max(260, winW - 32);
    const rowW = chartRowWidth > 40 ? chartRowWidth : fallbackW;
    const lineAreaW = Math.max(80, rowW - Y_AXIS_LABEL_WIDTH);
    const n = lineChartData.length;
    const spacing =
      n > 0 ? Math.max(1, (lineAreaW - CHART_INITIAL_SPACING - CHART_END_SPACING) / Math.max(n, 1)) : 8;
    return { lineAreaW, spacing, rowW };
  }, [chartRowWidth, winW, lineChartData.length]);

  /** Start, middle and end dates, drawn under the chart as one row: the library wraps a label to the width of one data step. */
  const xAxisDates = useMemo(() => {
    const n = lineChartData.length;
    if (n === 0) return [];
    const at = (i: number) => axisDateLabel(lineChartData[i]!.timestamp);
    return n > 2 ? [at(0), at(Math.floor(n / 2)), at(n - 1)] : [at(0), at(n - 1)];
  }, [lineChartData]);

  const lineScale = useMemo(() => computeLineChartScale(linePoints), [linePoints]);

  /** The chart is drawn, so a screen reader gets its shape as one sentence instead. */
  const lineChartSummary = useMemo(() => {
    if (linePoints.length === 0) return '';
    const values = linePoints.map((p) => p.balance_minor);
    const first = values[0]!;
    const last = values[values.length - 1]!;
    const lowest = values.reduce((a, v) => (v < a ? v : a), first);
    const highest = values.reduce((a, v) => (v > a ? v : a), first);
    const fmt = (v: number) => formatMinorForDisplay(v, currency);
    return `Line chart, ${currency}, from ${axisDateLabel(rangeMeta.startMs)} to ${axisDateLabel(rangeMeta.endMs)}. Starts at ${fmt(first)}, ends at ${fmt(last)}, lowest ${fmt(lowest)}, highest ${fmt(highest)}.`;
  }, [linePoints, currency, rangeMeta.startMs, rangeMeta.endMs]);

  const toggle = () => {
    animateNextLayout();
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.cardTitle}>Balance over time</Text>
        <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
      </Pressable>

      {expanded ? (
        <>
          <TimeRangePickerField
            label="Time range"
            value={rangeValue}
            onChange={setRangeValue}
            earliestMs={earliestMs}
          />
          <Text style={styles.cardSub}>
            {axisDateLabel(rangeMeta.startMs)} → {axisDateLabel(rangeMeta.endMs)} · {currency}
          </Text>
          {loading ? (
            <View style={styles.chartLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <Text style={styles.error}>Could not read the ledger. Try again.</Text>
          ) : lineChartData.length === 0 ? (
            <Text style={styles.muted}>No data in this range.</Text>
          ) : (
            <View
              style={styles.chartWrap}
              onLayout={(e) => {
                const w = Math.round(e.nativeEvent.layout.width);
                if (w > 0 && Math.abs(w - chartRowWidth) > 2) {
                  setChartRowWidth(w);
                }
              }}
            >
              <View style={styles.readoutRow}>
                {activePoint ? (
                  <>
                    <Text style={styles.readoutDate}>{formatOccurredAt(activePoint.ts)}</Text>
                    <Text style={styles.readoutAmt}>{formatMinorForDisplay(activePoint.v, currency)}</Text>
                  </>
                ) : (
                  <Text style={styles.axisHint}>Tap the chart for date and balance.</Text>
                )}
              </View>
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={lineChartSummary}
                importantForAccessibility="no-hide-descendants"
              >
                <LineChart
                  data={lineChartData}
                  parentWidth={lineLayout.rowW}
                  width={lineLayout.lineAreaW}
                  height={220}
                  spacing={lineLayout.spacing}
                  initialSpacing={CHART_INITIAL_SPACING}
                  endSpacing={CHART_END_SPACING}
                  adjustToWidth={false}
                  curved={false}
                  areaChart
                  hideDataPoints
                  thickness={2}
                  color={colors.primary}
                  startFillColor={colors.primary}
                  endFillColor={colors.primary}
                  startOpacity={0.25}
                  endOpacity={0.02}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor={colors.textMuted}
                  rulesType="solid"
                  rulesColor={colors.border}
                  noOfSections={LINE_NO_OF_SECTIONS}
                  maxValue={lineScale.maxValue}
                  stepValue={lineScale.stepValue}
                  mostNegativeValue={lineScale.mostNegativeValue}
                  noOfSectionsBelowXAxis={lineScale.noOfSectionsBelowXAxis}
                  yAxisTextStyle={{ color: colors.textMuted, fontSize: 12, fontFamily: font.regular }}
                  yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
                  formatYLabel={formatYAxisMajorLabel}
                  pointerConfig={{
                    pointerStripColor: colors.border,
                    pointerStripWidth: 1,
                    pointerColor: colors.primary,
                    radius: 5,
                    activatePointersOnLongPress: false,
                    activatePointersInstantlyOnTouch: true,
                    persistPointer: true,
                    resetPointerIndexOnRelease: false,
                    // No floating label box (see `readoutRow` above the chart) — this callback only
                    // reports the touched point's data into React state. It fires during the chart
                    // library's own render pass, so the update is deferred a tick (requestAnimationFrame)
                    // rather than calling setState synchronously while a different component renders.
                    pointerLabelComponent: (
                      items: { value: number; timestamp?: number }[] | undefined,
                      _secondary: unknown,
                      pointerIndex: unknown
                    ) => {
                      const it = items?.[0];
                      if (!it) return null;
                      const v = Math.round(Number(it.value));
                      const idx = typeof pointerIndex === 'number' ? pointerIndex : 0;
                      const ts =
                        typeof it.timestamp === 'number'
                          ? it.timestamp
                          : typeof lineChartData[idx]?.timestamp === 'number'
                            ? lineChartData[idx].timestamp
                            : null;
                      if (ts != null && (activePointRef.current?.ts !== ts || activePointRef.current?.v !== v)) {
                        const next = { ts, v };
                        activePointRef.current = next;
                        requestAnimationFrame(() => setActivePoint(next));
                      }
                      return null;
                    },
                  }}
                />
              </View>
              <View
                style={[
                  styles.xAxisRow,
                  { marginLeft: Y_AXIS_LABEL_WIDTH + CHART_INITIAL_SPACING, width: lineLayout.lineAreaW },
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {xAxisDates.map((d, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.xAxisLabel,
                      i === 0 ? styles.xAxisFirst : i === xAxisDates.length - 1 ? styles.xAxisLast : null,
                    ]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {d}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    card: {
      marginTop: 20,
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
    },
    cardTitle: { fontFamily: font.bold, fontSize: 17, color: c.text },
    chevron: { fontSize: 22, color: c.primary, fontFamily: font.semibold, lineHeight: 22 },
    cardSub: { fontSize: 13, color: c.textMuted, marginTop: 10, marginBottom: 12 },
    muted: { fontSize: 14, color: c.textMuted, lineHeight: 20 },
    error: { fontSize: 14, color: c.danger, lineHeight: 20 },
    chartLoading: { height: 220, justifyContent: 'center', alignItems: 'center' },
    chartWrap: { alignSelf: 'stretch', marginTop: 4 },
    /** Fixed-position readout for the touched point — normal layout flow, not an absolutely
     *  positioned overlay, so it can't be clipped by Android's ScrollView view-flattening the
     *  way a floating chart-library tooltip was. */
    readoutRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minHeight: 18, marginBottom: 10 },
    xAxisRow: { flexDirection: 'row', marginTop: 6 },
    xAxisLabel: { flex: 1, fontSize: 12, color: c.textMuted, textAlign: 'center' },
    xAxisFirst: { textAlign: 'left' },
    xAxisLast: { textAlign: 'right' },
    axisHint: { fontSize: 12, color: c.textMuted, lineHeight: 16 },
    readoutDate: { fontSize: 12, color: c.textMuted },
    readoutAmt: { fontSize: 14, fontFamily: font.semibold, color: c.text },
  });
}
