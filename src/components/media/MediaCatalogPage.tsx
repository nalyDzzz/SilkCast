import { MediaCatalogContent } from '@/components/media/MediaCatalogContent';
import { CatalogGroupList } from '@/components/media/CatalogGroupList';
import { MediaCatalogFiltersBar } from '@/components/media/MediaCatalogFiltersBar';
import { useMediaCatalog } from '@/components/media/hooks/useMediaCatalog';

type MediaCatalogPageProps = {
  mediaKind: 'movie' | 'series';
};

export function MediaCatalogPage({ mediaKind }: MediaCatalogPageProps) {
  const catalog = useMediaCatalog(mediaKind);
  const { copy, filters, data, playback, series, selectedSourceId } = catalog;

  const catalogSummary =
    selectedSourceId === null
      ? `Select or import a source to browse ${copy.pluralLabel}.`
      : data.loading
        ? `Loading your ${copy.pluralLabel}...`
        : `${data.items.length.toLocaleString()} ${copy.pluralLabel} available`;

  return (
    <main className="box-border h-full overflow-hidden p-4 md:p-6">
      <section className="flex h-full min-h-0 flex-col gap-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{catalogSummary}</p>
        </header>

        <MediaCatalogFiltersBar
          query={filters.query}
          onQueryChange={filters.setQuery}
          selectedGroup={filters.selectedGroup}
          onSelectedGroupChange={filters.setSelectedGroup}
          groups={data.groups}
          allGroupsValue={copy.allGroupsValue}
          searchPlaceholder={copy.searchPlaceholder}
          favoritesFieldId={copy.favoritesFieldId}
          favoritesOnly={filters.favoritesOnly}
          onFavoritesOnlyChange={filters.setFavoritesOnly}
          disabled={selectedSourceId === null}
        />

        <div className="flex min-h-0 flex-1 gap-4">
          {!series.isViewingSeriesEpisodes ? (
            <CatalogGroupList
              className="hidden w-60 shrink-0 lg:flex"
              groups={data.groups}
              selectedGroup={filters.selectedGroup}
              allGroupsValue={copy.allGroupsValue}
              allLabel={`All ${copy.pluralLabel}`}
              onSelect={filters.setSelectedGroup}
            />
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
            {data.error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {data.error}
              </p>
            ) : null}

            <div className="min-h-0 flex-1">
              <MediaCatalogContent
                mediaKind={mediaKind}
                items={data.items}
                playingItemId={playback.playingItemId}
                lastPlayedItemId={playback.lastPlayedItemId}
                brokenPosterIds={playback.brokenPosterIds}
                isViewingSeriesEpisodes={series.isViewingSeriesEpisodes}
                selectedSeriesItem={series.selectedSeriesItem}
                seriesEpisodes={series.seriesEpisodes}
                episodeRecords={series.episodeRecords}
                scrollKey={catalog.scrollKey}
                seriesEpisodesLoading={series.seriesEpisodesLoading}
                seriesEpisodesError={series.seriesEpisodesError}
                onRetryEpisodes={series.handleRetryEpisodes}
                onPlayItem={catalog.playCatalogItem}
                onToggleFavorite={data.handleToggleFavorite}
                onOpenSeries={series.handleOpenSeries}
                onPlaySeriesEpisode={series.handlePlaySeriesEpisode}
                onBackToSeriesCatalog={series.handleBackToSeriesCatalog}
                onPosterError={playback.handlePosterError}
              />
            </div>

            {!data.loading && !series.isViewingSeriesEpisodes && data.items.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No {copy.pluralLabel} matched these filters for the selected source.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
