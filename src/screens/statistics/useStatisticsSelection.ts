import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import type { ModalSelectOption } from '../../components/ModalSelectField';
import * as assetTypesRepo from '../../db/repositories/assetTypes';
import * as pocketsRepo from '../../db/repositories/pockets';
import * as settingsRepo from '../../db/repositories/settings';
import type { StatisticsScope } from '../../db/repositories/statistics';
import type { AssetType, Pocket } from '../../domain/types';
import { assetSubtitle } from '../../utils/assetLabel';

/**
 * The asset and pocket scope shared by the Statistics overview and month screens, so a change on
 * one shows on the other. Memory only: the app starts with the default currency and all pockets.
 */
type Selection = { currency: string | null; scopeKey: string };

let selection: Selection = { currency: null, scopeKey: 'all' };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setStatisticsSelection(patch: Partial<Selection>): void {
  selection = { ...selection, ...patch };
  for (const l of listeners) l();
}

/**
 * Loads what the selection needs (asset types, pockets, the Jar) on every focus and resolves the
 * shared selection against it: an asset or pocket that no longer exists falls back to the default.
 * `ready` stays false until the first load, so screens do not query with a guessed asset.
 */
export function useStatisticsSelection() {
  const current = useSyncExternalStore(subscribe, () => selection);
  const [loaded, setLoaded] = useState<{
    assetTypes: AssetType[];
    defaultCurrency: string;
    jarPocket: Pocket | null;
    pockets: Pocket[];
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const showArchived = await settingsRepo.getShowArchivedPockets();
        const [assetTypes, defaultCurrency, jarPocket, pockets] = await Promise.all([
          assetTypesRepo.listAssetTypes(),
          settingsRepo.getDefaultCurrency(),
          pocketsRepo.getJarPocket(),
          pocketsRepo.listPockets(showArchived),
        ]);
        if (!cancelled) setLoaded({ assetTypes, defaultCurrency, jarPocket, pockets });
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const assetTypes = loaded?.assetTypes ?? [];
  const jarPocket = loaded?.jarPocket ?? null;
  const pockets = loaded?.pockets ?? [];

  const currency = useMemo(() => {
    if (!loaded) return null;
    const known = (code: string | null) => !!code && loaded.assetTypes.some((t) => t.code === code);
    if (known(current.currency)) return current.currency;
    if (known(loaded.defaultCurrency)) return loaded.defaultCurrency;
    return loaded.assetTypes[0]?.code ?? null;
  }, [loaded, current.currency]);

  const scopeKey = useMemo(() => {
    const key = current.scopeKey;
    if (key === 'exclude_jar') return jarPocket && !jarPocket.archived ? key : 'all';
    if (key.startsWith('pocket:')) {
      const id = key.slice('pocket:'.length);
      return pockets.some((p) => p.id === id) ? key : 'all';
    }
    return 'all';
  }, [current.scopeKey, jarPocket, pockets]);

  // Keyed by the Jar's id, not the object: every focus reloads the pockets, and a new scope object
  // would make the screens query again for nothing.
  const jarId = jarPocket?.id ?? null;
  const scope = useMemo((): StatisticsScope => {
    if (scopeKey === 'exclude_jar' && jarId) return { mode: 'exclude_jar', jarId };
    if (scopeKey.startsWith('pocket:')) return { mode: 'pocket', pocketId: scopeKey.slice('pocket:'.length) };
    return { mode: 'all' };
  }, [scopeKey, jarId]);

  const scopeOptions = useMemo((): ModalSelectOption[] => {
    const opts: ModalSelectOption[] = [{ value: 'all', title: 'All pockets', subtitle: 'Every pocket of this asset' }];
    if (jarPocket && !jarPocket.archived) {
      opts.push({ value: 'exclude_jar', title: 'Outside Jar', subtitle: 'All pockets except the Jar' });
    }
    for (const p of pockets) {
      opts.push({ value: `pocket:${p.id}`, title: p.name, subtitle: p.is_jar ? 'Jar' : 'Pocket' });
    }
    return opts;
  }, [pockets, jarPocket]);

  const assetOptions = useMemo(
    (): ModalSelectOption[] =>
      assetTypes.map((a) => ({ value: a.code, title: a.code, subtitle: assetSubtitle(a.code, a.name) })),
    [assetTypes]
  );

  const scopeLabel = scopeOptions.find((o) => o.value === scopeKey)?.title ?? 'All pockets';

  return {
    ready: loaded !== null,
    hasAssets: assetTypes.length > 0,
    currency,
    scopeKey,
    scope,
    scopeLabel,
    scopeOptions,
    assetOptions,
    setCurrency: (code: string) => setStatisticsSelection({ currency: code }),
    setScopeKey: (key: string) => setStatisticsSelection({ scopeKey: key }),
  };
}

export type StatisticsSelectionState = ReturnType<typeof useStatisticsSelection>;
