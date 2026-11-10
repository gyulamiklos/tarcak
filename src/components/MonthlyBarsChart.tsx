import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chartScale } from '../domain/monthlyStats';
import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';
import { formatAxisMajor } from '../utils/formatAxisLabel';

export type MonthBars = {
  key: string;
  /** Short month name under the column. */
  label: string;
  /** Minor units as numbers: only the bar lengths come from these. */
  income: number;
  expense: number;
};

type Props = {
  months: MonthBars[];
  incomeColor: string;
  expenseColor: string;
  onPressMonth: (key: string) => void;
  /** One sentence for screen readers; the month list below is the readable version. */
  summary: string;
};

const PLOT_HEIGHT = 140;
const BAR_GAP = 2;

/**
 * Income and expense per month as pairs of bars from a zero line (a negative month hangs below it).
 * Plain views, no chart library: each month is one pressable column, so a tap always lands.
 */
export function MonthlyBarsChart({ months, incomeColor, expenseColor, onPressMonth, summary }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useMemo(() => chartScale(months.flatMap((m) => [m.income, m.expense])), [months]);
  const span = scale.top - scale.bottom;
  const zeroY = (scale.top / span) * PLOT_HEIGHT;

  const bar = (value: number, color: string) => {
    const h = (Math.abs(value) / span) * PLOT_HEIGHT;
    return (
      <View
        style={[
          styles.bar,
          { backgroundColor: color, height: Math.max(value === 0 ? 0 : 1, h) },
          value >= 0 ? { bottom: PLOT_HEIGHT - zeroY } : { top: zeroY },
        ]}
      />
    );
  };

  return (
    <View>
      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.swatch, { backgroundColor: incomeColor }]} />
        <Text style={styles.legendText}>Income</Text>
        <View style={[styles.swatch, { backgroundColor: expenseColor }]} />
        <Text style={styles.legendText}>Expense</Text>
        <Text style={styles.topLabel} maxFontSizeMultiplier={1.2}>
          {formatAxisMajor(scale.top)}
        </Text>
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={summary}>
        <View style={styles.plot} importantForAccessibility="no-hide-descendants">
          <View style={[styles.rule, { top: 0 }]} />
          <View style={[styles.zeroLine, { top: Math.min(zeroY, PLOT_HEIGHT - 1) }]} />
          {months.map((m) => (
            <Pressable
              key={m.key}
              style={({ pressed }) => [styles.column, pressed && styles.columnPressed]}
              onPress={() => onPressMonth(m.key)}
            >
              <View style={styles.pair}>
                <View style={styles.slot}>{bar(m.income, incomeColor)}</View>
                <View style={styles.slot}>{bar(m.expense, expenseColor)}</View>
              </View>
            </Pressable>
          ))}
        </View>
        <View style={styles.labels} importantForAccessibility="no-hide-descendants">
          {months.map((m, i) => (
            <Text key={m.key} style={styles.monthLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {/* Every other month, counted from the newest, so the labels never crowd. */}
              {(months.length - 1 - i) % 2 === 0 ? m.label : ''}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    swatch: { width: 10, height: 10, borderRadius: 2 },
    legendText: { fontSize: 12, color: c.textSecondary, marginRight: 8 },
    topLabel: { marginLeft: 'auto', fontSize: 12, color: c.textMuted },
    plot: { height: PLOT_HEIGHT, flexDirection: 'row' },
    rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: c.border },
    zeroLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: c.textMuted },
    column: { flex: 1, borderRadius: 4 },
    columnPressed: { backgroundColor: c.surfaceMuted },
    pair: { flex: 1, flexDirection: 'row', gap: BAR_GAP, paddingHorizontal: 3 },
    slot: { flex: 1 },
    bar: { position: 'absolute', left: 0, right: 0, borderRadius: 2 },
    labels: { flexDirection: 'row', marginTop: 4 },
    monthLabel: { flex: 1, textAlign: 'center', fontSize: 12, color: c.textMuted },
  });
}
