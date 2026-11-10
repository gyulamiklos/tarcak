import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';

export type TimeRangePresetId = '7d' | '30d' | '90d' | 'ytd' | '1y' | 'all';

export type TimeRangeValue =
  | { kind: 'preset'; id: TimeRangePresetId }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'custom'; fromYear: number; fromMonth: number; toYear: number; toMonth: number };

type YearMonth = { year: number; month: number };

const PRESET_ORDER: TimeRangePresetId[] = ['7d', '30d', '90d', 'ytd', '1y', 'all'];
const PRESET_LABELS: Record<TimeRangePresetId, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  '1y': 'Last 12 months',
  all: 'All time',
};

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfMonthMs(year: number, month: number): number {
  return new Date(year, month, 1, 0, 0, 0, 0).getTime();
}

function endOfMonthMs(year: number, month: number): number {
  return new Date(year, month + 1, 1, 0, 0, 0, 0).getTime() - 1;
}

function shiftMonth(year: number, month: number, delta: number): YearMonth {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

export function resolveTimeRange(
  value: TimeRangeValue,
  nowMs: number,
  earliestMs: number | null
): { startMs: number; endMs: number } {
  const day = 86_400_000;
  if (value.kind === 'preset') {
    if (value.id === '7d') return { startMs: nowMs - 7 * day, endMs: nowMs };
    if (value.id === '30d') return { startMs: nowMs - 30 * day, endMs: nowMs };
    if (value.id === '90d') return { startMs: nowMs - 90 * day, endMs: nowMs };
    if (value.id === 'ytd') {
      const d = new Date(nowMs);
      return { startMs: new Date(d.getFullYear(), 0, 1).getTime(), endMs: nowMs };
    }
    if (value.id === '1y') return { startMs: nowMs - 365 * day, endMs: nowMs };
    return { startMs: earliestMs ?? nowMs - 365 * day, endMs: nowMs };
  }
  if (value.kind === 'month') {
    const start = startOfMonthMs(value.year, value.month);
    const end = Math.min(endOfMonthMs(value.year, value.month), nowMs);
    return { startMs: start, endMs: Math.max(end, start) };
  }
  const start = startOfMonthMs(value.fromYear, value.fromMonth);
  const end = Math.min(endOfMonthMs(value.toYear, value.toMonth), nowMs);
  return { startMs: start, endMs: Math.max(end, start) };
}

export function formatTimeRangeLabel(value: TimeRangeValue): string {
  if (value.kind === 'preset') return PRESET_LABELS[value.id] ?? value.id;
  if (value.kind === 'month') return `${MONTH_LONG[value.month]} ${value.year}`;
  return `${MONTH_SHORT[value.fromMonth]} ${value.fromYear} – ${MONTH_SHORT[value.toMonth]} ${value.toYear}`;
}

type Props = {
  label: string;
  value: TimeRangeValue;
  onChange: (value: TimeRangeValue) => void;
  /** Earliest transaction timestamp; bounds how far back the month browser goes. Null when unknown. */
  earliestMs: number | null;
};

export function TimeRangePickerField({ label, value, onChange, earliestMs }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'quick' | 'month' | 'custom'>('quick');

  const now = Date.now();
  const currentYearMonth = useMemo<YearMonth>(() => {
    const d = new Date(now);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [now]);
  const minYear = earliestMs ? new Date(earliestMs).getFullYear() : currentYearMonth.year - 5;

  const [browseYear, setBrowseYear] = useState(currentYearMonth.year);
  const [draftFrom, setDraftFrom] = useState<YearMonth>(() => shiftMonth(currentYearMonth.year, currentYearMonth.month, -2));
  const [draftTo, setDraftTo] = useState<YearMonth>(currentYearMonth);

  useEffect(() => {
    if (!open) return;
    if (value.kind === 'preset') {
      setTab('quick');
    } else if (value.kind === 'month') {
      setTab('month');
      setBrowseYear(value.year);
    } else {
      setTab('custom');
      setDraftFrom({ year: value.fromYear, month: value.fromMonth });
      setDraftTo({ year: value.toYear, month: value.toMonth });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFutureMonth = (ym: YearMonth) => startOfMonthMs(ym.year, ym.month) > now;

  const applyPreset = (id: TimeRangePresetId) => {
    onChange({ kind: 'preset', id });
    setOpen(false);
  };
  const applyMonth = (ym: YearMonth) => {
    onChange({ kind: 'month', year: ym.year, month: ym.month });
    setOpen(false);
  };
  const applyCustom = () => {
    onChange({
      kind: 'custom',
      fromYear: draftFrom.year,
      fromMonth: draftFrom.month,
      toYear: draftTo.year,
      toMonth: draftTo.month,
    });
    setOpen(false);
  };

  const nextFrom = shiftMonth(draftFrom.year, draftFrom.month, 1);
  const prevFrom = shiftMonth(draftFrom.year, draftFrom.month, -1);
  const nextTo = shiftMonth(draftTo.year, draftTo.month, 1);
  const prevTo = shiftMonth(draftTo.year, draftTo.month, -1);

  const fromPrevDisabled = compareYearMonth(prevFrom, { year: minYear, month: 0 }) < 0;
  const fromNextDisabled = isFutureMonth(nextFrom) || compareYearMonth(nextFrom, draftTo) > 0;
  const toPrevDisabled = compareYearMonth(prevTo, draftFrom) < 0;
  const toNextDisabled = isFutureMonth(nextTo);
  const customValid = compareYearMonth(draftFrom, draftTo) <= 0;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={styles.fieldText} numberOfLines={1}>
          {formatTimeRangeLabel(value)}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Time range</Text>

            <View style={styles.tabRow}>
              {(
                [
                  { id: 'quick', label: 'Quick' },
                  { id: 'month', label: 'Month' },
                  { id: 'custom', label: 'Custom' },
                ] as const
              ).map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.tabChip, tab === t.id && styles.tabChipOn]}
                  onPress={() => setTab(t.id)}
                >
                  <Text style={[styles.tabChipText, tab === t.id && styles.tabChipTextOn]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {tab === 'quick' ? (
              <View style={styles.quickGrid}>
                {PRESET_ORDER.map((id) => {
                  const selected = value.kind === 'preset' && value.id === id;
                  return (
                    <Pressable
                      key={id}
                      style={[styles.optionChip, selected && styles.optionChipOn]}
                      onPress={() => applyPreset(id)}
                    >
                      <Text style={[styles.optionChipText, selected && styles.optionChipTextOn]}>
                        {PRESET_LABELS[id]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {tab === 'month' ? (
              <View>
                <View style={styles.yearRow}>
                  <Pressable
                    style={styles.yearBtn}
                    onPress={() => setBrowseYear((y) => Math.max(minYear, y - 1))}
                    disabled={browseYear <= minYear}
                  >
                    <Text
                      style={[styles.yearBtnText, browseYear <= minYear && styles.yearBtnTextDisabled]}
                    >
                      ‹
                    </Text>
                  </Pressable>
                  <Text style={styles.yearLabel}>{browseYear}</Text>
                  <Pressable
                    style={styles.yearBtn}
                    onPress={() => setBrowseYear((y) => Math.min(currentYearMonth.year, y + 1))}
                    disabled={browseYear >= currentYearMonth.year}
                  >
                    <Text
                      style={[
                        styles.yearBtnText,
                        browseYear >= currentYearMonth.year && styles.yearBtnTextDisabled,
                      ]}
                    >
                      ›
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.monthGrid}>
                  {MONTH_SHORT.map((name, m) => {
                    const ym = { year: browseYear, month: m };
                    const disabled = isFutureMonth(ym);
                    const selected =
                      value.kind === 'month' && value.year === browseYear && value.month === m;
                    return (
                      <Pressable
                        key={name}
                        style={[
                          styles.monthCell,
                          selected && styles.monthCellOn,
                          disabled && styles.monthCellDisabled,
                        ]}
                        onPress={() => !disabled && applyMonth(ym)}
                        disabled={disabled}
                      >
                        <Text
                          style={[
                            styles.monthCellText,
                            selected && styles.monthCellTextOn,
                            disabled && styles.monthCellTextDisabled,
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {tab === 'custom' ? (
              <View>
                <Text style={styles.customLabel}>From</Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    style={[styles.stepperBtn, fromPrevDisabled && styles.stepperBtnDisabled]}
                    onPress={() => !fromPrevDisabled && setDraftFrom(prevFrom)}
                    disabled={fromPrevDisabled}
                    accessibilityRole="button"
                    accessibilityLabel="Previous month, from"
                    accessibilityState={{ disabled: fromPrevDisabled }}
                  >
                    <Text style={styles.stepperBtnText} accessibilityElementsHidden importantForAccessibility="no">‹</Text>
                  </Pressable>
                  <Text style={styles.stepperLabel}>
                    {MONTH_SHORT[draftFrom.month]} {draftFrom.year}
                  </Text>
                  <Pressable
                    style={[styles.stepperBtn, fromNextDisabled && styles.stepperBtnDisabled]}
                    onPress={() => !fromNextDisabled && setDraftFrom(nextFrom)}
                    disabled={fromNextDisabled}
                    accessibilityRole="button"
                    accessibilityLabel="Next month, from"
                    accessibilityState={{ disabled: fromNextDisabled }}
                  >
                    <Text style={styles.stepperBtnText} accessibilityElementsHidden importantForAccessibility="no">›</Text>
                  </Pressable>
                </View>

                <Text style={styles.customLabel}>To</Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    style={[styles.stepperBtn, toPrevDisabled && styles.stepperBtnDisabled]}
                    onPress={() => !toPrevDisabled && setDraftTo(prevTo)}
                    disabled={toPrevDisabled}
                    accessibilityRole="button"
                    accessibilityLabel="Previous month, to"
                    accessibilityState={{ disabled: toPrevDisabled }}
                  >
                    <Text style={styles.stepperBtnText} accessibilityElementsHidden importantForAccessibility="no">‹</Text>
                  </Pressable>
                  <Text style={styles.stepperLabel}>
                    {MONTH_SHORT[draftTo.month]} {draftTo.year}
                  </Text>
                  <Pressable
                    style={[styles.stepperBtn, toNextDisabled && styles.stepperBtnDisabled]}
                    onPress={() => !toNextDisabled && setDraftTo(nextTo)}
                    disabled={toNextDisabled}
                    accessibilityRole="button"
                    accessibilityLabel="Next month, to"
                    accessibilityState={{ disabled: toNextDisabled }}
                  >
                    <Text style={styles.stepperBtnText} accessibilityElementsHidden importantForAccessibility="no">›</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.applyBtn, !customValid && styles.applyBtnDisabled]}
                  onPress={() => customValid && applyCustom()}
                  disabled={!customValid}
                >
                  <Text style={styles.applyBtnText}>Apply</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    label: { fontFamily: font.semibold, marginBottom: 6, color: c.text, fontSize: 13 },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: c.inputBg,
      gap: 10,
    },
    fieldText: { flex: 1, fontSize: 15, fontFamily: font.semibold, color: c.inputText },
    chevron: { fontSize: 20, color: c.textMuted, fontWeight: '300' },
    overlay: { flex: 1, backgroundColor: c.modalOverlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 28,
      borderTopWidth: 1,
      borderColor: c.border,
    },
    sheetTitle: { fontSize: 18, fontFamily: font.bold, marginBottom: 14, color: c.text },
    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    tabChip: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 20,
      alignItems: 'center',
      backgroundColor: c.pillBg,
    },
    tabChipOn: { backgroundColor: c.primary },
    tabChipText: { fontFamily: font.semibold, fontSize: 13, color: c.pillText },
    tabChipTextOn: { color: c.onPrimary },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    optionChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    optionChipText: { fontFamily: font.semibold, fontSize: 14, color: c.textSecondary },
    optionChipTextOn: { color: c.onPrimary },
    yearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      marginBottom: 14,
    },
    yearBtn: { paddingHorizontal: 14, paddingVertical: 6 },
    yearBtnText: { fontSize: 24, color: c.primary, fontWeight: '300' },
    yearBtnTextDisabled: { color: c.textMuted, opacity: 0.4 },
    yearLabel: { fontSize: 17, fontFamily: font.bold, color: c.text, minWidth: 64, textAlign: 'center' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    monthCell: {
      flexBasis: '30%',
      flexGrow: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    monthCellOn: { backgroundColor: c.primary, borderColor: c.primary },
    monthCellDisabled: { opacity: 0.35 },
    monthCellText: { fontFamily: font.semibold, fontSize: 14, color: c.textSecondary },
    monthCellTextOn: { color: c.onPrimary },
    monthCellTextDisabled: { color: c.textMuted },
    customLabel: { fontFamily: font.semibold, color: c.textMuted, marginBottom: 6, marginTop: 4 },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      marginBottom: 12,
    },
    stepperBtn: {
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: c.pillBg,
    },
    stepperBtnDisabled: { opacity: 0.35 },
    stepperBtnText: { fontSize: 20, color: c.primary, fontWeight: '300' },
    stepperLabel: {
      fontSize: 16,
      fontFamily: font.semibold,
      color: c.text,
      minWidth: 100,
      textAlign: 'center',
    },
    applyBtn: {
      marginTop: 8,
      backgroundColor: c.primary,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    applyBtnDisabled: { opacity: 0.4 },
    applyBtnText: { fontFamily: font.bold, fontSize: 15, color: c.onPrimary },
    closeBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
    closeBtnText: { color: c.textMuted, fontFamily: font.semibold, fontSize: 15 },
  });
}
