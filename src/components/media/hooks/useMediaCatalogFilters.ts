import { useEffect, useState } from 'react';
import {
  resolveCatalogView,
  useCatalogViewStore,
} from '@/components/media/catalogViewStore';
import type { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';

const QUERY_DEBOUNCE_MS = 180;

type UseMediaCatalogFiltersArgs = {
  mediaKind: MediaCatalogKind;
  selectedSourceId: number | null;
  allGroupsValue: string;
};

export function useMediaCatalogFilters({
  mediaKind,
  selectedSourceId,
  allGroupsValue,
}: UseMediaCatalogFiltersArgs) {
  const storedView = useCatalogViewStore((state) => state.views[mediaKind]);
  const updateView = useCatalogViewStore((state) => state.updateView);
  const view = resolveCatalogView(storedView, selectedSourceId);
  // Start from the stored query so returning to the page filters immediately.
  const [debouncedQuery, setDebouncedQuery] = useState(view.query);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(view.query);
    }, QUERY_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [view.query]);

  return {
    view,
    selectedGroup: view.group ?? allGroupsValue,
    setSelectedGroup: (value: string) =>
      updateView(mediaKind, selectedSourceId, {
        group: value === allGroupsValue ? null : value,
      }),
    query: view.query,
    setQuery: (query: string) =>
      updateView(mediaKind, selectedSourceId, { query }),
    debouncedQuery,
    favoritesOnly: view.favoritesOnly,
    setFavoritesOnly: (favoritesOnly: boolean) =>
      updateView(mediaKind, selectedSourceId, { favoritesOnly }),
    selectedGroupName: view.group,
  };
}
