import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';
import { HIT_SLOP } from '../utils/hitSlop';

export type ModalSelectOption = {
  value: string;
  title: string;
  subtitle?: string;
};

type Props = {
  label: string;
  /** Shown in the closed field; empty string uses placeholder */
  displayValue: string;
  placeholder: string;
  modalTitle: string;
  options: ModalSelectOption[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  /** Pocket lists use the same tile colors as the old inline picker */
  variant?: 'default' | 'pocket';
  emptyMessage?: string;
  /** Tighter label + field for toolbar / multi-column rows (e.g. History filters). */
  compact?: boolean;
  /** Soft warm tint on compact labels, chevron, field border, and sheet top edge (e.g. History filters). */
  accent?: boolean;
  /** Tap toggles a checkmark and keeps the sheet open so several can be picked; tapping the
   *  designated "__all__" option clears the selection and closes. */
  multiSelect?: boolean;
  /** Values currently toggled on; shown with a checkmark. */
  selectedValues?: string[];
  onToggleValue?: (value: string) => void;
  /** `chip`: a small pill showing only the value (the label is read out, not shown), e.g. Statistics. */
  trigger?: 'field' | 'chip';
};

export function ModalSelectField({
  label,
  displayValue,
  placeholder,
  modalTitle,
  options,
  onSelect,
  disabled,
  variant = 'default',
  emptyMessage = 'Nothing to choose yet.',
  compact = false,
  accent = false,
  multiSelect = false,
  selectedValues = [],
  onToggleValue,
  trigger = 'field',
}: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, variant, compact, accent),
    [colors, variant, compact, accent]
  );
  const [open, setOpen] = useState(false);
  const trimmed = displayValue.trim();
  const showPlaceholder = !trimmed;

  return (
    <View>
      {trigger === 'chip' ? (
        <Pressable
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, disabled && styles.fieldDisabled]}
          onPress={() => !disabled && setOpen(true)}
          disabled={disabled}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${showPlaceholder ? placeholder : trimmed}`}
          accessibilityState={{ disabled: !!disabled }}
        >
          <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
            {showPlaceholder ? placeholder : trimmed}
          </Text>
          <Text style={styles.chipChevron}>▾</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.label}>{label}</Text>
          <Pressable
            style={[styles.field, disabled && styles.fieldDisabled]}
            onPress={() => !disabled && setOpen(true)}
            disabled={disabled}
          >
            <Text
              style={[styles.fieldText, showPlaceholder && styles.fieldPlaceholder]}
              numberOfLines={compact ? 1 : 2}
              ellipsizeMode="tail"
            >
              {showPlaceholder ? placeholder : trimmed}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{modalTitle}</Text>
            {multiSelect ? (
              <Text style={styles.multiHint}>Tap to select several · Tap &quot;All&quot; to clear</Text>
            ) : null}
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              {options.length === 0 ? (
                <Text style={styles.empty}>{emptyMessage}</Text>
              ) : (
                options.map((opt) => {
                  const isAllOption = opt.value === '__all__';
                  const checked = multiSelect && !isAllOption && selectedValues.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.row, checked && styles.rowChecked]}
                      onPress={() => {
                        if (multiSelect && !isAllOption && onToggleValue) {
                          onToggleValue(opt.value);
                          return;
                        }
                        onSelect(opt.value);
                        setOpen(false);
                      }}
                    >
                      {multiSelect ? (
                        <View style={[styles.checkSlot, checked && styles.checkSlotOn]}>
                          {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                      ) : null}
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle}>{opt.title}</Text>
                        {opt.subtitle ? <Text style={styles.rowSub}>{opt.subtitle}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(
  c: AppColors,
  variant: 'default' | 'pocket',
  compact: boolean,
  accent: boolean
) {
  /** Compact filter rows use one grey for all three fields; full-size pocket pickers keep tile styling. */
  const isPocket = variant === 'pocket';
  const fieldBg = isPocket && !compact ? c.pocketPickBg : c.inputBg;
  const fieldBorderDefault = isPocket && !compact ? c.pocketPickBorder : c.inputBorder;
  const fieldBorder = accent && compact ? c.jarSoftBorder : fieldBorderDefault;
  const rowBg = isPocket ? c.pocketPickBg : c.surface;
  const rowBorder = isPocket ? c.pocketPickBorder : c.border;
  const fieldTextColor = isPocket && !compact ? c.pocketPickText : c.inputText;
  const rowTextColor = isPocket ? c.pocketPickText : c.text;

  return StyleSheet.create({
    label: {
      fontFamily: font.semibold,
      marginTop: compact ? 2 : 12,
      marginBottom: compact ? 4 : 6,
      fontSize: compact ? 11 : undefined,
      color: compact ? (accent ? c.primary : c.textMuted) : c.text,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: fieldBorder,
      borderRadius: compact ? 8 : 10,
      paddingHorizontal: compact ? 8 : 14,
      paddingVertical: compact ? 10 : 14,
      backgroundColor: fieldBg,
      gap: compact ? 4 : 10,
    },
    fieldDisabled: { opacity: 0.5 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 200,
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.jarSoftBorder,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipPressed: { borderColor: c.primary },
    chipText: { flexShrink: 1, fontSize: 13, fontFamily: font.semibold, color: c.chipText },
    chipChevron: { fontSize: 12, color: c.chipText },
    fieldText: { flex: 1, fontSize: compact ? 13 : 16, color: fieldTextColor },
    fieldPlaceholder: { color: c.placeholder },
    chevron: {
      fontSize: compact ? 18 : 22,
      color: accent && compact ? c.primary : c.textMuted,
      fontWeight: '300',
    },
    overlay: {
      flex: 1,
      backgroundColor: c.modalOverlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 28,
      maxHeight: '72%',
      borderTopWidth: accent ? 2 : 1,
      borderColor: accent ? c.jarSoftBorder : c.border,
    },
    sheetTitle: {
      fontSize: 18,
      fontFamily: font.bold,
      marginBottom: 12,
      color: c.text,
    },
    multiHint: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: -6,
      marginBottom: 10,
    },
    scroll: { maxHeight: 360 },
    empty: { color: c.textMuted, paddingVertical: 16, fontSize: 15 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginBottom: 6,
      backgroundColor: rowBg,
      borderWidth: 1,
      borderColor: rowBorder,
    },
    rowChecked: {
      borderColor: c.primary,
      backgroundColor: accent ? c.chipBg : rowBg,
    },
    checkSlot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    checkSlotOn: {
      borderColor: c.primary,
      backgroundColor: c.primary,
    },
    checkMark: {
      color: c.onPrimary,
      fontSize: 14,
      fontFamily: font.bold,
      lineHeight: 16,
    },
    rowText: { flex: 1 },
    rowTitle: { fontSize: 16, fontFamily: font.semibold, color: rowTextColor },
    rowSub: { fontSize: 13, color: isPocket ? c.pocketPickText : c.textMuted, marginTop: 3, opacity: isPocket ? 0.65 : 1 },
    closeBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
    closeBtnText: { color: c.textMuted, fontFamily: font.semibold, fontSize: 16 },
  });
}
