import {
  ChannelRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import { VirtualizedLiveChannelList } from '@/components/live/VirtualizedLiveChannelList';
import { SeriesEpisodeList } from '@/components/media/SeriesEpisodeList';
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
  seriesEpisodesLoading: boolean;
  seriesEpisodesError: string | null;
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
  seriesEpisodesLoading,
  seriesEpisodesError,
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
        loading={seriesEpisodesLoading}
        error={seriesEpisodesError}
        playingSeriesId={playingItemId}
        onBack={onBackToSeriesCatalog}
        onPlayEpisode={onPlaySeriesEpisode}
      />
    );
  }

  return (
    <VirtualizedMovieGrid
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
