import {
  ChannelRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import { VirtualizedLiveChannelList } from '@/components/live/VirtualizedLiveChannelList';
import { SeriesEpisodeList } from '@/components/media/SeriesEpisodeList';
import {
  readScrollOffset,
  writeScrollOffset,
} from '@/components/media/catalogViewStore';
import { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { MovieCard } from '@/components/movies/MovieCard';
import { VirtualizedMovieGrid } from '@/components/movies/VirtualizedMovieGrid';

type MediaCatalogContentProps = {
  mediaKind: MediaCatalogKind;
  items: ChannelRecord[];
  liveNowByChannelId: Record<number, string>;
  activeItemId: number | null;
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
  liveNowByChannelId,
  activeItemId,
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
  if (mediaKind === 'live') {
    return (
      <div className="h-full min-h-0 overflow-hidden rounded-xl border bg-card/80 p-2 backdrop-blur">
        <VirtualizedLiveChannelList
          key={scrollKey}
          initialScrollOffset={readScrollOffset(scrollKey)}
          onScrollOffsetChange={(offset) => writeScrollOffset(scrollKey, offset)}
          channels={items}
          epgNowByChannelId={liveNowByChannelId}
          activeChannelId={activeItemId}
          playingChannelId={playingItemId}
          onPlay={(nextItem) => void onPlayItem(nextItem)}
          onToggleFavorite={(nextItem) => void onToggleFavorite(nextItem)}
        />
      </div>
    );
  }

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
