import type { ChannelRecord } from '@/components/app/types';
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
  /** Identifies the current list for scroll-position restore. */
  scrollKey: string;
  onPlayItem: (item: ChannelRecord) => Promise<void>;
  onOpenMovie: (item: ChannelRecord) => void;
  onToggleFavorite: (item: ChannelRecord) => Promise<boolean>;
  onOpenSeries: (item: ChannelRecord) => Promise<void>;
  onPosterError: (itemId: number) => void;
};

export function MediaCatalogContent({
  mediaKind,
  items,
  playingItemId,
  lastPlayedItemId,
  brokenPosterIds,
  scrollKey,
  onPlayItem,
  onOpenMovie,
  onToggleFavorite,
  onOpenSeries,
  onPosterError,
}: MediaCatalogContentProps) {
  // Read once per list; positions are saved while the player is open.
  const resumeEntries = useMemo(() => getResumeEntries(), [items]);

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
          onOpen={(nextItem) =>
            mediaKind === 'series' ? void onOpenSeries(nextItem) : onOpenMovie(nextItem)
          }
          onPlay={mediaKind === 'movie' ? (nextItem) => void onPlayItem(nextItem) : undefined}
          onToggleFavorite={(nextItem) => void onToggleFavorite(nextItem)}
          onPosterError={onPosterError}
        />
      )}
    />
  );
}
