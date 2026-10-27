import {
  ChannelRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import { SeriesEpisodeList } from '@/components/media/SeriesEpisodeList';
import {
  readScrollOffset,
  writeScrollOffset,
} from '@/components/media/catalogViewStore';
import { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { MovieCard } from '@/components/movies/MovieCard';
import { VirtualizedMovieGrid } from '@/components/movies/VirtualizedMovieGrid';
import { resumeKeyFor } from '@/components/player/hooks/useResumeTracking';
import { getResumeEntries } from '@/lib/player/playerStorage';
import { useMemo } from 'react';

type MediaCatalogContentProps = {
  mediaKind: MediaCatalogKind;
  items: ChannelRecord[];
  playingItemId: number | null;
  lastPlayedItemId: number | null;
  brokenPosterIds: Record<number, true>;
  isViewingSeriesEpisodes: boolean;
  selectedSeriesItem: ChannelRecord | null;
  seriesEpisodes: SeriesEpisodeRecord[];
  episodeRecords: ChannelRecord[];
  seriesEpisodesLoading: boolean;
  seriesEpisodesError: string | null;
  /** Identifies the current list for scroll-position restore. */
  scrollKey: string;
  onRetryEpisodes: () => void;
  onPlayItem: (item: ChannelRecord) => Promise<void>;
  onToggleFavorite: (item: ChannelRecord) => Promise<void>;
  onOpenSeries: (item: ChannelRecord) => Promise<void>;
  onPlaySeriesEpisode: (episode: SeriesEpisodeRecord) => void;
  onBackToSeriesCatalog: () => void;
  onPosterError: (itemId: number) => void;
};

export function MediaCatalogContent({
  mediaKind,
  items,
  playingItemId,
  lastPlayedItemId,
  brokenPosterIds,
  isViewingSeriesEpisodes,
  selectedSeriesItem,
  seriesEpisodes,
  episodeRecords,
  seriesEpisodesLoading,
  seriesEpisodesError,
  scrollKey,
  onRetryEpisodes,
  onPlayItem,
  onToggleFavorite,
  onOpenSeries,
  onPlaySeriesEpisode,
  onBackToSeriesCatalog,
  onPosterError,
}: MediaCatalogContentProps) {
  // Read once per list; positions are saved while the player is open.
  const resumeEntries = useMemo(() => getResumeEntries(), [items]);

  if (isViewingSeriesEpisodes && selectedSeriesItem) {
    return (
      <SeriesEpisodeList
        series={selectedSeriesItem}
        episodes={seriesEpisodes}
        episodeRecords={episodeRecords}
        loading={seriesEpisodesLoading}
        error={seriesEpisodesError}
        playingSeriesId={playingItemId}
        onBack={onBackToSeriesCatalog}
        onRetry={onRetryEpisodes}
        onPlayEpisode={onPlaySeriesEpisode}
      />
    );
  }

  const resumeProgress = (item: ChannelRecord) => {
    const entry = resumeEntries[resumeKeyFor(item)];
    return entry && entry.duration > 0 ? Math.min(entry.position / entry.duration, 1) : null;
  };

  return (
    <VirtualizedMovieGrid
      key={scrollKey}
      initialScrollOffset={readScrollOffset(scrollKey)}
      onScrollOffsetChange={(offset) => writeScrollOffset(scrollKey, offset)}
      items={items}
      getItemKey={(item) => item.id}
      renderItem={(item) => (
        <MovieCard
          movie={item}
          isPlaying={playingItemId === item.id}
          isLastPlayed={lastPlayedItemId === item.id}
          isPosterBroken={Boolean(brokenPosterIds[item.id])}
          progress={mediaKind === 'movie' ? resumeProgress(item) : null}
          onPlay={(nextItem) =>
            mediaKind === 'series'
              ? void onOpenSeries(nextItem)
              : void onPlayItem(nextItem)
          }
          onToggleFavorite={(nextItem) => void onToggleFavorite(nextItem)}
          onPosterError={onPosterError}
        />
      )}
    />
  );
}
