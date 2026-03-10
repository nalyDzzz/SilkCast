import { useCallback, useEffect, useRef, useState } from 'react';
import { ChannelRecord, GroupRecord } from '@/components/app/types';
import { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import {
  listSourceChannels,
  setChannelFavoriteState,
} from '@/lib/api/channelsApi';
import { listSourceGroups } from '@/lib/api/sourcesApi';

type UseMediaCatalogDataArgs = {
  selectedSourceId: number | null;
  mediaKind: MediaCatalogKind;
  selectedGroupName: string | null;
  debouncedQuery: string;
  favoritesOnly: boolean;
};

export function useMediaCatalogData({
  selectedSourceId,
  mediaKind,
  selectedGroupName,
  debouncedQuery,
  favoritesOnly,
}: UseMediaCatalogDataArgs) {
  const [items, setItems] = useState<ChannelRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestVersionRef = useRef(0);

  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  const refreshCatalog = useCallback(() => {
    setRefreshVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (selectedSourceId === null) {
      setGroups([]);
      return;
    }

    void listSourceGroups(selectedSourceId, mediaKind)
      .then(setGroups)
      .catch((err) => setError(String(err)));
  }, [mediaKind, refreshVersion, selectedSourceId]);

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
      query: debouncedQuery.trim() === '' ? null : debouncedQuery.trim(),
      favoritesOnly,
    })
      .then((nextItems) => {
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
    debouncedQuery,
    favoritesOnly,
    mediaKind,
    refreshVersion,
    selectedGroupName,
    selectedSourceId,
  ]);

  const handleToggleFavorite = useCallback(
    async (item: ChannelRecord) => {
      try {
        await setChannelFavoriteState(item.id, !item.is_favorite);
        setItems((current) =>
          favoritesOnly && item.is_favorite
            ? current.filter((currentItem) => currentItem.id !== item.id)
            : current.map((currentItem) =>
                currentItem.id === item.id
                  ? {
                      ...currentItem,
                      is_favorite: !currentItem.is_favorite,
                    }
                  : currentItem
              )
        );
      } catch (err) {
        setError(String(err));
      }
    },
    [favoritesOnly]
  );

  return {
    items,
    groups,
    loading,
    error,
    reportError,
    refreshCatalog,
    handleToggleFavorite,
  };
}
