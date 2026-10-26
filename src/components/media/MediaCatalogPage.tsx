import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { MediaCatalogContent } from '@/components/media/MediaCatalogContent';
import { CatalogGroupList } from '@/components/media/CatalogGroupList';
import { MediaCatalogFiltersBar } from '@/components/media/MediaCatalogFiltersBar';
import { catalogScrollKey } from '@/components/media/catalogViewStore';
import { useLiveNowEpg } from '@/components/media/hooks/useLiveNowEpg';
import { useMediaCatalogData } from '@/components/media/hooks/useMediaCatalogData';
import { useMediaCatalogEvents } from '@/components/media/hooks/useMediaCatalogEvents';
import { useMediaCatalogFilters } from '@/components/media/hooks/useMediaCatalogFilters';
import { useMediaCatalogPlayback } from '@/components/media/hooks/useMediaCatalogPlayback';
import { useSeriesEpisodes } from '@/components/media/hooks/useSeriesEpisodes';
import {
  MEDIA_COPY,
  MediaCatalogKind,
} from '@/components/media/mediaCatalogConfig';
import type { ChannelRecord } from '@/components/app/types';
import { useAppStore } from '@/store/appStore';

type MediaCatalogPageProps = {
  mediaKind: MediaCatalogKind;
};

export function MediaCatalogPage({ mediaKind }: MediaCatalogPageProps) {
  const copy = MEDIA_COPY[mediaKind];
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeChannel,
    sources,
    selectedSourceId,
    settings,
    loadSources,
    loadSettings,
    loadRecents,
    loadPlaybackStatus,
    setPlayback,
    playChannelRecord,
  } = useAppStore(
    useShallow((state) => ({
      activeChannel: state.activeChannel,
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      settings: state.settings,
      loadSources: state.loadSources,
      loadSettings: state.loadSettings,
      loadRecents: state.loadRecents,
      loadPlaybackStatus: state.loadPlaybackStatus,
      setPlayback: state.setPlayback,
      playChannelRecord: state.playChannelRecord,
    }))
  );

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );
  const supportsSeriesEpisodeList = useMemo(
    () => mediaKind === 'series' && selectedSource?.source_type === 'xtream',
    [mediaKind, selectedSource?.source_type]
  );
  const activeItemId = useMemo(
    () => (activeChannel?.media_kind === mediaKind ? activeChannel.id : null),
    [activeChannel, mediaKind]
  );

  const {
    selectedGroup,
    setSelectedGroup,
    query,
    setQuery,
    debouncedQuery,
    favoritesOnly,
    setFavoritesOnly,
    selectedGroupName,
    view,
  } = useMediaCatalogFilters({
    mediaKind,
    selectedSourceId,
    allGroupsValue: copy.allGroupsValue,
  });

  const {
    items,
    groups,
    loading,
    error,
    reportError,
    handleToggleFavorite,
  } = useMediaCatalogData({
    selectedSourceId,
    mediaKind,
    selectedGroupName,
    debouncedQuery,
    favoritesOnly,
  });

  const navigateToPlayer = useCallback(() => {
    navigate('/dashboard/player', {
      state: {
        returnTo: location.pathname,
      },
    });
  }, [location.pathname, navigate]);

  const {
    playingItemId,
    lastPlayedItemId,
    brokenPosterIds,
    handlePlayItem,
    handlePosterError,
    handleExternalPlaybackClosed,
  } = useMediaCatalogPlayback({
    singularLabel: copy.singularLabel,
    preferredPlayer: settings.preferred_player,
    playChannelRecord,
    navigateToPlayer,
    reportError,
  });

  // Live channels play with the filtered list as a zapping queue.
  const handlePlayCatalogItem = useCallback(
    (item: ChannelRecord) =>
      handlePlayItem(item, mediaKind === 'live' ? items : undefined),
    [handlePlayItem, items, mediaKind]
  );

  const {
    selectedSeriesItem,
    seriesEpisodes,
    episodeRecords,
    seriesEpisodesLoading,
    seriesEpisodesError,
    isViewingSeriesEpisodes,
    handleOpenSeries,
    handlePlaySeriesEpisode,
    handleBackToSeriesCatalog,
    handleRetryEpisodes,
  } = useSeriesEpisodes({
    mediaKind,
    selectedSourceId,
    supportsSeriesEpisodeList,
    playItem: handlePlayItem,
  });

  const { liveNowByChannelId, refreshEpg } = useLiveNowEpg({
    mediaKind,
    selectedSourceId,
    selectedSourceType: selectedSource?.source_type,
    items,
  });

  useMediaCatalogEvents({
    mediaKind,
    selectedSourceId,
    loadSources,
    loadSettings,
    loadRecents,
    loadPlaybackStatus,
    setPlayback,
    reportError,
    onEpgUpdated: refreshEpg,
    onExternalPlaybackClosed: handleExternalPlaybackClosed,
  });

  const catalogSummary = useMemo(() => {
    if (selectedSourceId === null) {
      return `Select or import a source to browse ${copy.pluralLabel}.`;
    }

    if (loading) {
      return `Loading your ${copy.pluralLabel}...`;
    }

    return `${items.length.toLocaleString()} ${copy.pluralLabel} available`;
  }, [copy.pluralLabel, items.length, loading, selectedSourceId]);

  return (
    <main className="box-border h-full overflow-hidden p-4 md:p-6">
      <section className="flex h-full min-h-0 flex-col gap-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground">{catalogSummary}</p>
        </header>

        <MediaCatalogFiltersBar
          query={query}
          onQueryChange={setQuery}
          selectedGroup={selectedGroup}
          onSelectedGroupChange={setSelectedGroup}
          groups={groups}
          allGroupsValue={copy.allGroupsValue}
          searchPlaceholder={copy.searchPlaceholder}
          favoritesFieldId={copy.favoritesFieldId}
          favoritesOnly={favoritesOnly}
          onFavoritesOnlyChange={setFavoritesOnly}
          disabled={selectedSourceId === null}
        />

        <div className="flex min-h-0 flex-1 gap-4">
          {!isViewingSeriesEpisodes ? (
            <CatalogGroupList
              className="hidden w-60 shrink-0 lg:flex"
              groups={groups}
              selectedGroup={selectedGroup}
              allGroupsValue={copy.allGroupsValue}
              allLabel={`All ${copy.pluralLabel}`}
              onSelect={setSelectedGroup}
            />
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="min-h-0 flex-1">
              <MediaCatalogContent
                mediaKind={mediaKind}
                items={items}
                liveNowByChannelId={liveNowByChannelId}
                activeItemId={activeItemId}
                playingItemId={playingItemId}
                lastPlayedItemId={lastPlayedItemId}
                brokenPosterIds={brokenPosterIds}
                isViewingSeriesEpisodes={isViewingSeriesEpisodes}
                selectedSeriesItem={selectedSeriesItem}
                seriesEpisodes={seriesEpisodes}
                episodeRecords={episodeRecords}
                scrollKey={catalogScrollKey(mediaKind, {
                  ...view,
                  query: debouncedQuery,
                })}
                seriesEpisodesLoading={seriesEpisodesLoading}
                seriesEpisodesError={seriesEpisodesError}
                onRetryEpisodes={handleRetryEpisodes}
                onPlayItem={handlePlayCatalogItem}
                onToggleFavorite={handleToggleFavorite}
                onOpenSeries={handleOpenSeries}
                onPlaySeriesEpisode={handlePlaySeriesEpisode}
                onBackToSeriesCatalog={handleBackToSeriesCatalog}
                onPosterError={handlePosterError}
              />
            </div>

            {!loading && !isViewingSeriesEpisodes && items.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No {copy.pluralLabel} matched these filters for the selected
                source.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
