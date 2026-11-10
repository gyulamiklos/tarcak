import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';

export type SegmentOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the choice for screen readers, e.g. "Break down by". */
  accessibilityLabel: string;
};

/** A row of mutually exclusive options; the selected one carries a border and bold text, not only colour. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segment, selected && styles.segmentSelected]}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.label}
          >
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    group: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 2,
      backgroundColor: c.surfaceMuted,
    },
    segment: {
      minHeight: 48,
      paddingHorizontal: 12,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: 1,
      // Keeps the selected segment, which has a border, from shifting its neighbours.
      borderColor: 'transparent',
    },
    segmentSelected: { backgroundColor: c.surface, borderColor: c.primary },
    label: { fontSize: 14, color: c.textSecondary },
    labelSelected: { fontFamily: font.semibold, color: c.primary },
  });
}
