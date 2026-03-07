import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import {
  BackendEvent,
  ChannelRecord,
  GroupRecord,
  PlaybackStatus,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import { LiveChannelRow } from '@/components/live/LiveChannelRow';
import { SeriesEpisodeList } from '@/components/media/SeriesEpisodeList';
import { MovieCard } from '@/components/movies/MovieCard';
import { VirtualizedMovieGrid } from '@/components/movies/VirtualizedMovieGrid';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listSourceChannels,
  setChannelFavoriteState,
} from '@/lib/api/channelsApi';
import { subscribeBackendEvents } from '@/lib/api/eventsApi';
import { listSeriesEpisodes } from '@/lib/api/seriesApi';
import { listSourceGroups } from '@/lib/api/sourcesApi';
import { useAppStore } from '@/store/appStore';

type MediaCatalogKind = 'live' | 'movie' | 'series';

type MediaCatalogCopy = {
  title: string;
  singularLabel: string;
  pluralLabel: string;
  allGroupsValue: string;
  favoritesFieldId: string;
  searchPlaceholder: string;
};

const MEDIA_COPY: Record<MediaCatalogKind, MediaCatalogCopy> = {
  live: {
    title: 'Live TV',
    singularLabel: 'Channel',
    pluralLabel: 'channels',
    allGroupsValue: '__all_live__',
    favoritesFieldId: 'live-favorites-only',
    searchPlaceholder: 'Search channels',
  },
  movie: {
    title: 'Movies',
    singularLabel: 'Movie',
    pluralLabel: 'movies',
    allGroupsValue: '__all_movies__',
    favoritesFieldId: 'movies-favorites-only',
    searchPlaceholder: 'Search movies',
  },
  series: {
    title: 'Series',
    singularLabel: 'Series',
    pluralLabel: 'series',
    allGroupsValue: '__all_series__',
    favoritesFieldId: 'series-favorites-only',
    searchPlaceholder: 'Search series',
  },
};

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

  const [items, setItems] = useState<ChannelRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState(copy.allGroupsValue);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingItemId, setPlayingItemId] = useState<number | null>(null);
  const [lastPlayedItemId, setLastPlayedItemId] = useState<number | null>(null);
  const [playbackMessage, setPlaybackMessage] = useState<string | null>(null);
  const [lastPlayedItemUrl, setLastPlayedItemUrl] = useState<string | null>(
    null
  );
  const [brokenPosterIds, setBrokenPosterIds] = useState<Record<number, true>>(
    {}
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestVersionRef = useRef(0);
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

  const selectedGroupName = useMemo(
    () => (selectedGroup === copy.allGroupsValue ? null : selectedGroup),
    [copy.allGroupsValue, selectedGroup]
  );
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );
  const supportsSeriesEpisodeList = useMemo(
    () => mediaKind === 'series' && selectedSource?.source_type === 'xtream',
    [mediaKind, selectedSource?.source_type]
  );
  const isViewingSeriesEpisodes = useMemo(
    () =>
      mediaKind === 'series' &&
      supportsSeriesEpisodeList &&
      selectedSeriesItem !== null,
    [mediaKind, selectedSeriesItem, supportsSeriesEpisodeList]
  );
  const activeItemId = useMemo(
    () => (activeChannel?.media_kind === mediaKind ? activeChannel.id : null),
    [activeChannel, mediaKind]
  );
  const catalogSummary = useMemo(() => {
    if (selectedSourceId === null) {
      return `Select or import a source to browse ${copy.pluralLabel}.`;
    }

    if (loading) {
      return `Loading your ${copy.pluralLabel}...`;
    }

    return `${items.length} ${copy.pluralLabel} available`;
  }, [copy.pluralLabel, items.length, loading, selectedSourceId]);

  useEffect(() => {
    void loadSources().catch((err) => setError(String(err)));
    void loadSettings().catch((err) => setError(String(err)));

    if (mediaKind === 'live') {
      void loadRecents().catch((err) => setError(String(err)));
      void loadPlaybackStatus().catch((err) => setError(String(err)));
    }
  }, [loadPlaybackStatus, loadRecents, loadSettings, loadSources, mediaKind]);

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate('/', { replace: true });
    }
  }, [navigate, selectedSourceId]);

  useEffect(() => {
    if (selectedSourceId === null) {
      setGroups([]);
      return;
    }

    void listSourceGroups(selectedSourceId, mediaKind)
      .then(setGroups)
      .catch((err) => setError(String(err)));
  }, [mediaKind, refreshVersion, selectedSourceId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    subscribeBackendEvents((backendEvent: BackendEvent) => {
      if (
        backendEvent.event === 'playback_state_changed' &&
        mediaKind === 'live'
      ) {
        const playbackState = backendEvent.payload['state'] as
          | PlaybackStatus
          | undefined;

        if (playbackState) {
          setPlayback(playbackState);
        }
        return;
      }

      if (backendEvent.event === 'sources_updated') {
        void loadSources().catch((err) => setError(String(err)));
        setRefreshVersion((current) => current + 1);
        return;
      }

      if (backendEvent.event === 'settings_updated') {
        void loadSettings().catch((err) => setError(String(err)));
        return;
      }

      if (backendEvent.event === 'recents_updated') {
        void loadRecents().catch((err) => setError(String(err)));
        return;
      }

      if (backendEvent.event !== 'external_playback_closed') {
        return;
      }

      const closedUrl = backendEvent.payload['url'];
      if (
        typeof closedUrl === 'string' &&
        lastPlayedItemUrl !== null &&
        closedUrl === lastPlayedItemUrl
      ) {
        setPlayingItemId(null);
        setLastPlayedItemId(null);
        setLastPlayedItemUrl(null);
        setPlaybackMessage(`${copy.singularLabel} playback ended.`);
      }
    })
      .then((unsubscribe) => {
        unlisten = unsubscribe;
      })
      .catch((err) => setError(String(err)));

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [
    copy.singularLabel,
    lastPlayedItemUrl,
    loadRecents,
    loadSettings,
    loadSources,
    mediaKind,
    setPlayback,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    seriesRequestVersionRef.current += 1;
    setSelectedSeriesItem(null);
    setSeriesEpisodes([]);
    setSeriesEpisodesLoading(false);
    setSeriesEpisodesError(null);
  }, [mediaKind, selectedSourceId]);

  useEffect(() => {
    if (selectedSourceId === null) {
      setItems([]);
      return;
    }

    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    setLoading(true);
    setError(null);
    void listSourceChannels({
      sourceId: selectedSourceId,
      mediaKind,
      groupName: selectedGroupName,
      query: debouncedQuery.trim() === '' ? null : debouncedQuery.trim(),
      favoritesOnly,
    })
      .then((nextItems) => {
        if (requestVersionRef.current === requestVersion) {
          setItems(nextItems);
        }
      })
      .catch((err) => {
        if (requestVersionRef.current === requestVersion) {
          setError(String(err));
        }
      })
      .finally(() => {
        if (requestVersionRef.current === requestVersion) {
          setLoading(false);
        }
      });
  }, [
    debouncedQuery,
    favoritesOnly,
    mediaKind,
    refreshVersion,
    selectedGroupName,
    selectedSourceId,
  ]);

  const handleToggleFavorite = useCallback(
    async (item: ChannelRecord) => {
      try {
        await setChannelFavoriteState(item.id, !item.is_favorite);
        setItems((current) =>
          favoritesOnly && item.is_favorite
            ? current.filter((currentItem) => currentItem.id !== item.id)
            : current.map((currentItem) =>
                currentItem.id === item.id
                  ? {
                      ...currentItem,
                      is_favorite: !currentItem.is_favorite,
                    }
                  : currentItem
              )
        );
      } catch (err) {
        setError(String(err));
      }
    },
    [favoritesOnly]
  );

  const handlePlayItem = useCallback(
    async (item: ChannelRecord) => {
      try {
        setPlayingItemId(item.id);
        setPlaybackMessage(`Starting "${item.name}"...`);
        await playChannelRecord(item);
        setLastPlayedItemId(item.id);
        setLastPlayedItemUrl(
          settings.preferred_player === 'mpv' ? item.stream_url : null
        );
        setPlaybackMessage(
          settings.preferred_player === 'mpv'
            ? `Now playing "${item.name}" in MPV pop-out.`
            : `Now playing "${item.name}" in the in-app player.`
        );
        if (settings.preferred_player === 'web') {
          navigate('/dashboard/player', {
            state: {
              returnTo: location.pathname,
            },
          });
        }
      } catch (err) {
        setError(String(err));
        setPlaybackMessage(null);
      } finally {
        setPlayingItemId(null);
      }
    },
    [location.pathname, navigate, playChannelRecord, settings.preferred_player]
  );

  const handlePosterError = useCallback((itemId: number) => {
    setBrokenPosterIds((current) => {
      if (current[itemId]) {
        return current;
      }
      return {
        ...current,
        [itemId]: true,
      };
    });
  }, []);

  const handleOpenSeries = useCallback(
    async (item: ChannelRecord) => {
      if (!supportsSeriesEpisodeList) {
        await handlePlayItem(item);
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
    [handlePlayItem, supportsSeriesEpisodeList]
  );

  const handlePlaySeriesEpisode = useCallback(
    (episode: SeriesEpisodeRecord) => {
      if (!selectedSeriesItem) {
        return;
      }

      void handlePlayItem({
        ...selectedSeriesItem,
        name: `${selectedSeriesItem.name} - ${episode.title}`,
        stream_url: episode.stream_url,
      });
    },
    [handlePlayItem, selectedSeriesItem]
  );

  const handleBackToSeriesCatalog = useCallback(() => {
    seriesRequestVersionRef.current += 1;
    setSelectedSeriesItem(null);
    setSeriesEpisodes([]);
    setSeriesEpisodesLoading(false);
    setSeriesEpisodesError(null);
  }, []);

  return (
    <main className="box-border h-full overflow-hidden p-4 md:p-6">
      <section className="flex h-full min-h-0 flex-col gap-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground">{catalogSummary}</p>
        </header>

        {playbackMessage ? (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            {playbackMessage}
          </p>
        ) : null}

        <div className="grid gap-3 rounded-xl border bg-card/80 p-3 backdrop-blur md:grid-cols-[1fr_220px_180px]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={copy.searchPlaceholder}
            disabled={selectedSourceId === null}
          />
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger disabled={selectedSourceId === null}>
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={copy.allGroupsValue}>All groups</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.name} value={group.name}>
                  {group.name} ({group.channel_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Field
            orientation="horizontal"
            className="justify-start rounded-md border px-3"
          >
            <Checkbox
              id={copy.favoritesFieldId}
              checked={favoritesOnly}
              onCheckedChange={(checked) => setFavoritesOnly(checked === true)}
            />
            <FieldLabel htmlFor={copy.favoritesFieldId}>
              Favorites only
            </FieldLabel>
          </Field>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1">
          {mediaKind === 'live' ? (
            <div className="h-full min-h-0 overflow-hidden rounded-xl border bg-card/80 p-2 backdrop-blur">
              <div className="h-full overflow-y-auto pr-1">
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <LiveChannelRow
                      key={item.id}
                      channel={item}
                      isActive={activeItemId === item.id}
                      isPlaying={playingItemId === item.id}
                      onPlay={(nextItem) => void handlePlayItem(nextItem)}
                      onToggleFavorite={(nextItem) =>
                        void handleToggleFavorite(nextItem)
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : isViewingSeriesEpisodes && selectedSeriesItem ? (
            <SeriesEpisodeList
              series={selectedSeriesItem}
              episodes={seriesEpisodes}
              loading={seriesEpisodesLoading}
              error={seriesEpisodesError}
              playingSeriesId={playingItemId}
              onBack={handleBackToSeriesCatalog}
              onPlayEpisode={handlePlaySeriesEpisode}
            />
          ) : (
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
                      ? void handleOpenSeries(nextItem)
                      : void handlePlayItem(nextItem)
                  }
                  onToggleFavorite={(nextItem) =>
                    void handleToggleFavorite(nextItem)
                  }
                  onPosterError={handlePosterError}
                />
              )}
            />
          )}
        </div>

        {!loading && !isViewingSeriesEpisodes && items.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No {copy.pluralLabel} matched these filters for the selected source.
          </p>
        ) : null}
      </section>
    </main>
  );
}
