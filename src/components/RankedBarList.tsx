import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme/ThemeContext';
import { font } from '../theme/fonts';
import type { AppColors } from '../theme/palette';
import { animateNextLayout } from '../utils/animateLayout';
import { HIT_SLOP } from '../utils/hitSlop';

export type RankedBar = {
  key: string;
  name: string;
  amountText: string;
  /** Empty for a row without a share (a negative total). */
  shareText: string;
  /** Null draws no bar (a negative total). */
  color: string | null;
  /** Bar length relative to the longest bar, 0..1. */
  fraction: number;
};

type Props = {
  /** Largest first; rows without a bar go last. */
  rows: RankedBar[];
  onPressRow?: (key: string) => void;
  /** Rows shown before "Show all". */
  maxVisible?: number;
};

/** Ranked rows (name, amount, share) with a horizontal bar under each: a readable list, not a chart. */
export function RankedBarList({ rows, onPressRow, maxVisible = 7 }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const canCollapse = rows.length > maxVisible;
  const shown = canCollapse && !expanded ? rows.slice(0, maxVisible) : rows;

  return (
    <View>
      {shown.map((r) => (
        <Pressable
          key={r.key}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={onPressRow ? () => onPressRow(r.key) : undefined}
          disabled={!onPressRow}
          accessibilityRole={onPressRow ? 'button' : undefined}
          accessibilityLabel={[r.name, r.amountText, r.shareText].filter(Boolean).join(', ')}
          accessibilityHint={onPressRow ? 'Shows these transactions' : undefined}
        >
          <View style={styles.head}>
            <Text style={styles.name} numberOfLines={2}>
              {r.name}
            </Text>
            <Text style={styles.amount}>{r.amountText}</Text>
            <Text style={styles.share}>{r.shareText}</Text>
          </View>
          {r.color ? (
            <View style={styles.track}>
              <View
                style={[styles.bar, { backgroundColor: r.color, width: `${Math.max(1, Math.round(r.fraction * 100))}%` }]}
              />
            </View>
          ) : null}
        </Pressable>
      ))}
      {canCollapse ? (
        <Pressable
          style={styles.more}
          onPress={() => {
            animateNextLayout();
            setExpanded((v) => !v);
          }}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
        >
          <Text style={styles.moreText}>{expanded ? 'Show fewer' : `Show all ${rows.length}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    row: { paddingVertical: 8, borderRadius: 8 },
    rowPressed: { backgroundColor: c.surfaceMuted },
    head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    name: { flex: 1, fontSize: 14, fontFamily: font.semibold, color: c.text },
    amount: { fontSize: 14, color: c.text },
    share: { minWidth: 48, textAlign: 'right', fontSize: 13, color: c.textMuted },
    track: { height: 8, borderRadius: 4, backgroundColor: c.barTrack, marginTop: 6, overflow: 'hidden' },
    bar: { height: 8, borderRadius: 4 },
    more: { paddingVertical: 10, alignItems: 'flex-start' },
    moreText: { fontSize: 14, fontFamily: font.semibold, color: c.primary },
  });
}
