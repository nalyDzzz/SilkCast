import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ChannelRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import {
  resolveCatalogView,
  useCatalogViewStore,
} from '@/components/media/catalogViewStore';
import type { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { toEpisodeRecord } from '@/components/media/seriesEpisodes';
import { listSeriesEpisodes } from '@/lib/api/seriesApi';

type UseSeriesEpisodesArgs = {
  mediaKind: MediaCatalogKind;
  selectedSourceId: number | null;
  supportsSeriesEpisodeList: boolean;
  playItem: (item: ChannelRecord, queue?: ChannelRecord[]) => Promise<void>;
};

const NO_EPISODES: SeriesEpisodeRecord[] = [];

export function useSeriesEpisodes({
  mediaKind,
  selectedSourceId,
  supportsSeriesEpisodeList,
  playItem,
}: UseSeriesEpisodesArgs) {
  const storedView = useCatalogViewStore((state) => state.views[mediaKind]);
  const updateView = useCatalogViewStore((state) => state.updateView);
  const cacheEpisodes = useCatalogViewStore((state) => state.cacheEpisodes);
  const view = resolveCatalogView(storedView, selectedSourceId);

  const selectedSeriesItem =
    mediaKind === 'series' && supportsSeriesEpisodeList
      ? view.selectedSeries
      : null;
  const selectedSeriesId = selectedSeriesItem?.id ?? null;
  const cachedEpisodes = useCatalogViewStore((state) =>
    selectedSeriesId === null
      ? undefined
      : state.episodesBySeriesId[selectedSeriesId]
  );
  const [loadError, setLoadError] = useState<{
    seriesId: number;
    message: string;
  } | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (selectedSeriesId === null || cachedEpisodes) {
      return;
    }

    let cancelled = false;
    listSeriesEpisodes(selectedSeriesId)
      .then((episodes) => {
        if (!cancelled) {
          cacheEpisodes(selectedSeriesId, episodes);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError({ seriesId: selectedSeriesId, message: String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheEpisodes, cachedEpisodes, retryToken, selectedSeriesId]);

  const seriesEpisodesError =
    loadError && loadError.seriesId === selectedSeriesId
      ? loadError.message
      : null;
  const seriesEpisodes = cachedEpisodes ?? NO_EPISODES;
  const seriesEpisodesLoading =
    selectedSeriesId !== null &&
    !cachedEpisodes &&
    seriesEpisodesError === null;

  const episodeRecords = useMemo(
    () =>
      selectedSeriesItem
        ? seriesEpisodes.map((episode) =>
            toEpisodeRecord(selectedSeriesItem, episode)
          )
        : [],
    [selectedSeriesItem, seriesEpisodes]
  );

  const handleOpenSeries = useCallback(
    async (item: ChannelRecord) => {
      if (!supportsSeriesEpisodeList) {
        await playItem(item);
        return;
      }

      setLoadError(null);
      updateView(mediaKind, selectedSourceId, { selectedSeries: item });
    },
    [
      mediaKind,
      playItem,
      selectedSourceId,
      supportsSeriesEpisodeList,
      updateView,
    ]
  );

  const handlePlaySeriesEpisode = useCallback(
    (episode: SeriesEpisodeRecord) => {
      const record = episodeRecords.find(
        (item) => item.stream_url === episode.stream_url
      );
      if (record) {
        void playItem(record, episodeRecords);
      }
    },
    [episodeRecords, playItem]
  );

  const handleBackToSeriesCatalog = useCallback(() => {
    updateView(mediaKind, selectedSourceId, { selectedSeries: null });
  }, [mediaKind, selectedSourceId, updateView]);

  const handleRetryEpisodes = useCallback(() => {
    setLoadError(null);
    setRetryToken((token) => token + 1);
  }, []);

  return {
    selectedSeriesItem,
    seriesEpisodes,
    episodeRecords,
    seriesEpisodesLoading,
    seriesEpisodesError,
    isViewingSeriesEpisodes: selectedSeriesItem !== null,
    handleOpenSeries,
    handlePlaySeriesEpisode,
    handleBackToSeriesCatalog,
    handleRetryEpisodes,
  };
}
