import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { TransactionDrill } from '../domain/transactionFilter';

export type RootStackParamList = {
  Home: undefined;
  Pockets: undefined;
  PocketDetail: { pocketId: string };
  TransactionEditor: {
    transactionId?: string;
    presetKind?: 'income' | 'expense' | 'transfer';
    pocketId?: string;
    fromPocketId?: string;
    toPocketId?: string;
  };
  /** `drill`: the transactions behind one Statistics breakdown row, instead of the normal filters. */
  History: { pocketId?: string; drill?: TransactionDrill } | undefined;
  Statistics: { initialCurrency?: string } | undefined;
  /** `monthKey` is `YYYY-MM`. */
  StatisticsMonth: { monthKey: string };
  ReportExport: undefined;
  Settings: undefined;
  AssetTypes: undefined;
  Categories: undefined;
  Jar: undefined;
  JarSplit: undefined;
  JarAdvanced: undefined;
  JarAdvancedAssetEditor: { currency: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
