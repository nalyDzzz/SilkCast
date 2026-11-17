import { Heart } from 'lucide-react';
import { FilterChip, FilterField } from '@/components/catalog/CatalogFilters';
import { GroupPicker } from '@/components/catalog/GroupPicker';
import { MovieDetails } from '@/components/details/MovieDetails';
import { MediaCatalogContent } from '@/components/media/MediaCatalogContent';
import { SeriesEpisodeList } from '@/components/media/SeriesEpisodeList';
import { useMediaCatalog } from '@/components/media/hooks/useMediaCatalog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type MediaCatalogPageProps = {
  mediaKind: 'movie' | 'series';
};

export function MediaCatalogPage({ mediaKind }: MediaCatalogPageProps) {
  const catalog = useMediaCatalog(mediaKind);
  const { copy, filters, data, playback, details, series, selectedSourceId } = catalog;

  if (details.selectedMovie) {
    const movie = details.selectedMovie;
    return (
      <MovieDetails
        key={movie.id}
        movie={movie}
        isStarting={playback.playingItemId === movie.id}
        preferredPlayer={catalog.settings.preferred_player}
        mpvAvailable={catalog.mpvAvailable}
        backLabel={`All ${copy.pluralLabel}`}
        onBack={details.closeMovie}
        onPlay={(item) => void catalog.playCatalogItem(item)}
        onOpenInMpv={(item, startSeconds) => void playback.handleOpenInMpv(item, startSeconds)}
        onToggleFavorite={(item) => void details.toggleDetailsFavorite(item)}
      />
    );
  }

  if (series.isViewingSeriesEpisodes && series.selectedSeriesItem) {
    return (
      <SeriesEpisodeList
        key={series.selectedSeriesItem.id}
        series={series.selectedSeriesItem}
        episodes={series.seriesEpisodes}
        episodeRecords={series.episodeRecords}
        loading={series.seriesEpisodesLoading}
        error={series.seriesEpisodesError}
        playingSeriesId={playback.playingItemId}
        backLabel={`All ${copy.pluralLabel}`}
        onBack={series.handleBackToSeriesCatalog}
        onRetry={series.handleRetryEpisodes}
        onPlayEpisode={series.handlePlaySeriesEpisode}
        onToggleFavorite={(item) => void details.toggleDetailsFavorite(item)}
      />
    );
  }

  const catalogSummary =
    selectedSourceId === null
      ? `Select or import a source to browse ${copy.pluralLabel}.`
      : data.loading
        ? `Loading ${copy.pluralLabel}…`
        : `${data.items.length.toLocaleString()} ${copy.pluralLabel}`;

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 px-6 pt-5 pb-6 lg:px-8">
      <h1 className="sr-only">{copy.title}</h1>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <GroupPicker
          groups={data.groups}
          selectedGroup={filters.selectedGroup}
          allGroupsValue={copy.allGroupsValue}
          allLabel={`All ${copy.pluralLabel}`}
          onSelect={filters.setSelectedGroup}
          disabled={selectedSourceId === null}
        />
        <FilterField
          value={filters.query}
          onChange={filters.setQuery}
          placeholder={copy.searchPlaceholder}
          disabled={selectedSourceId === null}
          className="w-64"
        />
        <FilterChip
          active={filters.favoritesOnly}
          onClick={() => filters.setFavoritesOnly(!filters.favoritesOnly)}
        >
          <Heart className={cn(filters.favoritesOnly && 'fill-thread text-thread')} />
          Favorites
        </FilterChip>
        <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">{catalogSummary}</span>
      </div>

      {data.error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {data.error}
        </p>
      ) : null}

      {!data.loading && data.items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="font-semibold">No {copy.pluralLabel} match these filters.</p>
          <p className="text-sm text-muted-foreground">Try another group, or clear the filter and favorites.</p>
          <Button
            variant="secondary"
            onClick={() => {
              filters.setQuery('');
              filters.setFavoritesOnly(false);
              filters.setSelectedGroup(copy.allGroupsValue);
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <MediaCatalogContent
            mediaKind={mediaKind}
            items={data.items}
            playingItemId={playback.playingItemId}
            lastPlayedItemId={playback.lastPlayedItemId}
            brokenPosterIds={playback.brokenPosterIds}
            scrollKey={catalog.scrollKey}
            onPlayItem={catalog.playCatalogItem}
            onOpenMovie={details.openMovie}
            onToggleFavorite={data.handleToggleFavorite}
            onOpenSeries={series.handleOpenSeries}
            onPosterError={playback.handlePosterError}
          />
        </div>
      )}
    </main>
  );
}
