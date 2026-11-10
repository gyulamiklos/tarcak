import { StyleSheet, View } from 'react-native';

import { ModalSelectField } from '../../components/ModalSelectField';
import type { StatisticsSelectionState } from './useStatisticsSelection';

/** Asset and pocket scope as two chips; each opens its picker directly. */
export function StatisticsChips({ selection }: { selection: StatisticsSelectionState }) {
  return (
    <View style={styles.row}>
      <ModalSelectField
        trigger="chip"
        label="Asset"
        displayValue={selection.currency ?? ''}
        placeholder="Asset"
        modalTitle="Asset"
        options={selection.assetOptions}
        onSelect={selection.setCurrency}
        emptyMessage="No asset types."
      />
      <ModalSelectField
        trigger="chip"
        label="Pockets"
        displayValue={selection.scopeLabel}
        placeholder="All pockets"
        modalTitle="Pockets"
        options={selection.scopeOptions}
        onSelect={selection.setScopeKey}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
