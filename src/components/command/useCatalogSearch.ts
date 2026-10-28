import { useEffect, useState } from 'react';
import type { ChannelRecord, GroupRecord } from '@/components/app/types';
import type { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { searchSourceChannels } from '@/lib/api/channelsApi';
import { listSourceGroups } from '@/lib/api/sourcesApi';
import { cleanName } from '@/lib/catalog/cleanName';

const SEARCH_DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 2;
export const RESULTS_PER_KIND = 6;
/** Asked per kind; extra room for divider rows, which are dropped here. */
const FETCH_PER_KIND = RESULTS_PER_KIND * 3;

export type CatalogSearchResults = Record<MediaCatalogKind, ChannelRecord[]>;
export type KindGroup = GroupRecord & { kind: MediaCatalogKind };

const EMPTY: CatalogSearchResults = { live: [], movie: [], series: [] };
const KINDS: MediaCatalogKind[] = ['live', 'movie', 'series'];

/** Catalog-wide search for the command palette, debounced and race-safe. */
export function useCatalogSearch(sourceId: number | null, query: string, enabled: boolean) {
  const [results, setResults] = useState<{ key: string; items: CatalogSearchResults }>({
    key: '',
    items: EMPTY,
  });
  const normalized = query.trim();
  const key = `${sourceId}|${normalized.toLowerCase()}`;
  const active = enabled && sourceId !== null && normalized.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!active || sourceId === null) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchSourceChannels(sourceId, normalized, FETCH_PER_KIND)
        .then((items) => {
          if (cancelled) return;
          const grouped: CatalogSearchResults = { live: [], movie: [], series: [] };
          for (const item of items) {
            const bucket = grouped[item.media_kind];
            if (bucket.length < RESULTS_PER_KIND && !cleanName(item.name).isSeparator) {
              bucket.push(item);
            }
          }
          setResults({ key, items: grouped });
        })
        .catch(() => {
          if (!cancelled) setResults({ key, items: EMPTY });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, key, normalized, sourceId]);

  return {
    results: active && results.key === key ? results.items : EMPTY,
    searching: active && results.key !== key,
  };
}

/** Every group across Live TV, Movies and Series, loaded once per source. */
export function useAllGroups(sourceId: number | null, enabled: boolean) {
  const [state, setState] = useState<{ sourceId: number | null; groups: KindGroup[] }>({
    sourceId: null,
    groups: [],
  });

  useEffect(() => {
    if (!enabled || sourceId === null || state.sourceId === sourceId) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      KINDS.map((kind) =>
        listSourceGroups(sourceId, kind)
          .then((groups) => groups.map((group) => ({ ...group, kind })))
          .catch(() => [] as KindGroup[])
      )
    ).then((lists) => {
      if (!cancelled) setState({ sourceId, groups: lists.flat() });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, sourceId, state.sourceId]);

  return state.sourceId === sourceId ? state.groups : [];
}
