import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChannelRecord, SeriesEpisodeRecord } from '@/components/app/types';
import { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { listSeriesEpisodes } from '@/lib/api/seriesApi';

type UseSeriesEpisodesArgs = {
  mediaKind: MediaCatalogKind;
  selectedSourceId: number | null;
  supportsSeriesEpisodeList: boolean;
  playItem: (item: ChannelRecord) => Promise<void>;
};

export function useSeriesEpisodes({
  mediaKind,
  selectedSourceId,
  supportsSeriesEpisodeList,
  playItem,
}: UseSeriesEpisodesArgs) {
  const seriesRequestVersionRef = useRef(0);
  const [selectedSeriesItem, setSelectedSeriesItem] =
    useState<ChannelRecord | null>(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState<SeriesEpisodeRecord[]>(
    []
  );
  const [seriesEpisodesLoading, setSeriesEpisodesLoading] = useState(false);
  const [seriesEpisodesError, setSeriesEpisodesError] = useState<string | null>(
    null
  );

  useEffect(() => {
    seriesRequestVersionRef.current += 1;
    setSelectedSeriesItem(null);
    setSeriesEpisodes([]);
    setSeriesEpisodesLoading(false);
    setSeriesEpisodesError(null);
  }, [mediaKind, selectedSourceId]);

  const handleOpenSeries = useCallback(
    async (item: ChannelRecord) => {
      if (!supportsSeriesEpisodeList) {
        await playItem(item);
        return;
      }

      const requestVersion = seriesRequestVersionRef.current + 1;
      seriesRequestVersionRef.current = requestVersion;

      setSelectedSeriesItem(item);
      setSeriesEpisodes([]);
      setSeriesEpisodesError(null);
      setSeriesEpisodesLoading(true);

      try {
        const episodes = await listSeriesEpisodes(item.id);
        if (seriesRequestVersionRef.current === requestVersion) {
          setSeriesEpisodes(episodes);
        }
      } catch (err) {
        if (seriesRequestVersionRef.current === requestVersion) {
          setSeriesEpisodesError(String(err));
        }
      } finally {
        if (seriesRequestVersionRef.current === requestVersion) {
          setSeriesEpisodesLoading(false);
        }
      }
    },
    [playItem, supportsSeriesEpisodeList]
  );

  const handlePlaySeriesEpisode = useCallback(
    (episode: SeriesEpisodeRecord) => {
      if (!selectedSeriesItem) {
        return;
      }

      void playItem({
        ...selectedSeriesItem,
        name: `${selectedSeriesItem.name} - ${episode.title}`,
        stream_url: episode.stream_url,
      });
    },
    [playItem, selectedSeriesItem]
  );

  const handleBackToSeriesCatalog = useCallback(() => {
    seriesRequestVersionRef.current += 1;
    setSelectedSeriesItem(null);
    setSeriesEpisodes([]);
    setSeriesEpisodesLoading(false);
    setSeriesEpisodesError(null);
  }, []);

  const isViewingSeriesEpisodes = useMemo(
    () =>
      mediaKind === 'series' &&
      supportsSeriesEpisodeList &&
      selectedSeriesItem !== null,
    [mediaKind, selectedSeriesItem, supportsSeriesEpisodeList]
  );

  return {
    selectedSeriesItem,
    seriesEpisodes,
    seriesEpisodesLoading,
    seriesEpisodesError,
    isViewingSeriesEpisodes,
    handleOpenSeries,
    handlePlaySeriesEpisode,
    handleBackToSeriesCatalog,
  };
}
