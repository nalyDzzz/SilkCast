import { useCallback, useEffect, useRef, useState } from 'react';
import { ChannelRecord, GroupRecord } from '@/components/app/types';
import {
  catalogResultCache,
  useCatalogViewStore,
} from '@/components/media/catalogViewStore';
import { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import {
  listSourceChannels,
  setChannelFavoriteState,
} from '@/lib/api/channelsApi';
import { listSourceGroups } from '@/lib/api/sourcesApi';

export function clearMediaCatalogCache() {
  catalogResultCache.clear();
}

type UseMediaCatalogDataArgs = {
  selectedSourceId: number | null;
  mediaKind: MediaCatalogKind;
  selectedGroupName: string | null;
  debouncedQuery: string;
  favoritesOnly: boolean;
};

function withFavoriteState(
  items: ChannelRecord[],
  itemId: number,
  isFavorite: boolean,
  removeItem: boolean
) {
  return removeItem
    ? items.filter((item) => item.id !== itemId)
    : items.map((item) =>
        item.id === itemId ? { ...item, is_favorite: isFavorite } : item
      );
}

export function useMediaCatalogData({
  selectedSourceId,
  mediaKind,
  selectedGroupName,
  debouncedQuery,
  favoritesOnly,
}: UseMediaCatalogDataArgs) {
  const normalizedQuery = debouncedQuery.trim();
  const groupsKey = `${selectedSourceId}|${mediaKind}`;
  const itemsKey = `${groupsKey}|${selectedGroupName ?? ''}|${normalizedQuery.toLowerCase()}|${favoritesOnly}`;
  const catalogVersion = useCatalogViewStore((state) => state.catalogVersion);
  const [items, setItems] = useState<ChannelRecord[]>(
    () => catalogResultCache.readItems(itemsKey) ?? []
  );
  const [groups, setGroups] = useState<GroupRecord[]>(
    () => catalogResultCache.readGroups(groupsKey) ?? []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersionRef = useRef(0);
  const itemsKeyRef = useRef(itemsKey);
  itemsKeyRef.current = itemsKey;

  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  useEffect(() => {
    if (selectedSourceId === null) {
      setGroups([]);
      return;
    }

    let cancelled = false;
    void listSourceGroups(selectedSourceId, mediaKind)
      .then((nextGroups) => {
        catalogResultCache.rememberGroups(groupsKey, nextGroups);
        if (!cancelled) {
          setGroups(nextGroups);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [catalogVersion, groupsKey, mediaKind, selectedSourceId]);

  useEffect(() => {
    if (selectedSourceId === null) {
      setItems([]);
      setLoading(false);
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    setLoading(true);
    setError(null);
    void listSourceChannels({
      sourceId: selectedSourceId,
      mediaKind,
      groupName: selectedGroupName,
      query: normalizedQuery === '' ? null : normalizedQuery,
      favoritesOnly,
    })
      .then((nextItems) => {
        catalogResultCache.rememberItems(itemsKey, nextItems);
        if (requestVersionRef.current === requestVersion) {
          setItems(nextItems);
        }
      })
      .catch((err) => {
        if (requestVersionRef.current === requestVersion) {
          setError(String(err));
        }
      })
      .finally(() => {
        if (requestVersionRef.current === requestVersion) {
          setLoading(false);
        }
      });
  }, [
    catalogVersion,
    favoritesOnly,
    itemsKey,
    mediaKind,
    normalizedQuery,
    selectedGroupName,
    selectedSourceId,
  ]);

  const handleToggleFavorite = useCallback(
    async (item: ChannelRecord) => {
      const isFavorite = !item.is_favorite;
      // In the favorites view, un-favoriting removes the row.
      const removeItem = favoritesOnly && !isFavorite;
      const keyAtToggle = itemsKey;

      try {
        await setChannelFavoriteState(item.id, isFavorite);
      } catch (err) {
        setError(String(err));
        return;
      }

      const cached = catalogResultCache.readItems(keyAtToggle);
      if (cached) {
        catalogResultCache.rememberItems(
          keyAtToggle,
          withFavoriteState(cached, item.id, isFavorite, removeItem)
        );
      }

      // Apply to the latest list, unless the filters changed while waiting.
      if (itemsKeyRef.current === keyAtToggle) {
        setItems((current) =>
          withFavoriteState(current, item.id, isFavorite, removeItem)
        );
      }
    },
    [favoritesOnly, itemsKey]
  );

  return {
    items,
    groups,
    loading,
    error,
    reportError,
    handleToggleFavorite,
  };
}
