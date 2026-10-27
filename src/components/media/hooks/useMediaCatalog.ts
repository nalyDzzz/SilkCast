import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import type { ChannelRecord } from '@/components/app/types';
import { catalogScrollKey } from '@/components/media/catalogViewStore';
import { useMediaCatalogData } from '@/components/media/hooks/useMediaCatalogData';
import { useMediaCatalogEvents } from '@/components/media/hooks/useMediaCatalogEvents';
import { useMediaCatalogFilters } from '@/components/media/hooks/useMediaCatalogFilters';
import { useMediaCatalogPlayback } from '@/components/media/hooks/useMediaCatalogPlayback';
import { useSeriesEpisodes } from '@/components/media/hooks/useSeriesEpisodes';
import { MEDIA_COPY, type MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { useAppStore } from '@/store/appStore';

const noop = () => undefined;

/**
 * Everything a catalog page needs (filters, results, playback, series
 * episodes, backend events), so Live TV and Movies/Series can each have their
 * own layout over the same behaviour.
 */
export function useMediaCatalog(mediaKind: MediaCatalogKind) {
  const copy = MEDIA_COPY[mediaKind];
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeChannel,
    sources,
    selectedSourceId,
    settings,
    playerEnvironment,
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
      playerEnvironment: state.playerEnvironment,
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
  const supportsSeriesEpisodeList =
    mediaKind === 'series' && selectedSource?.source_type === 'xtream';
  const activeItemId = activeChannel?.media_kind === mediaKind ? activeChannel.id : null;

  const filters = useMediaCatalogFilters({
    mediaKind,
    selectedSourceId,
    allGroupsValue: copy.allGroupsValue,
  });

  const data = useMediaCatalogData({
    selectedSourceId,
    mediaKind,
    selectedGroupName: filters.selectedGroupName,
    debouncedQuery: filters.debouncedQuery,
    favoritesOnly: filters.favoritesOnly,
  });

  const navigateToPlayer = useCallback(() => {
    navigate('/dashboard/player', { state: { returnTo: location.pathname } });
  }, [location.pathname, navigate]);

  const playback = useMediaCatalogPlayback({
    singularLabel: copy.singularLabel,
    preferredPlayer: settings.preferred_player,
    playChannelRecord,
    navigateToPlayer,
    reportError: data.reportError,
  });

  // Live channels play with the filtered list as a zapping queue.
  const { handlePlayItem } = playback;
  const { items } = data;
  const playCatalogItem = useCallback(
    (item: ChannelRecord) => handlePlayItem(item, mediaKind === 'live' ? items : undefined),
    [handlePlayItem, items, mediaKind]
  );

  const series = useSeriesEpisodes({
    mediaKind,
    selectedSourceId,
    supportsSeriesEpisodeList,
    playItem: handlePlayItem,
  });

  useMediaCatalogEvents({
    mediaKind,
    selectedSourceId,
    loadSources,
    loadSettings,
    loadRecents,
    loadPlaybackStatus,
    setPlayback,
    reportError: data.reportError,
    // Guide refreshes are tracked app-wide (see useGuideRefreshEvents).
    onEpgUpdated: noop,
    onExternalPlaybackClosed: playback.handleExternalPlaybackClosed,
  });

  return {
    copy,
    mediaKind,
    selectedSourceId,
    selectedSource,
    settings,
    mpvAvailable: playerEnvironment?.mpv_available ?? false,
    activeItemId,
    filters,
    data,
    playback,
    playCatalogItem,
    series,
    scrollKey: catalogScrollKey(mediaKind, { ...filters.view, query: filters.debouncedQuery }),
  };
}

export type MediaCatalog = ReturnType<typeof useMediaCatalog>;
