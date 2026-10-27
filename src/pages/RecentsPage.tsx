import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { BackendEvent, RecentChannelRecord } from '@/components/app/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { useBackendEvents } from '@/hooks/useBackendEvents';
import { useAppStore } from '@/store/appStore';
import { displayTitle } from '@/lib/catalog/cleanName';
import { PageHeader } from '@/components/layouts/PageHeader';

type RecentMediaKind = 'live' | 'movie' | 'series';

type RecentMediaCopy = {
  label: string;
  emptyLabel: string;
};

const RECENT_MEDIA: Record<RecentMediaKind, RecentMediaCopy> = {
  live: {
    label: 'Live TV',
    emptyLabel: 'live TV channels',
  },
  movie: {
    label: 'Movies',
    emptyLabel: 'movies',
  },
  series: {
    label: 'Series',
    emptyLabel: 'series episodes',
  },
};

const formatPlayedAt = (playedAt: number) =>
  new Date(playedAt * 1000).toLocaleString();

export function RecentsPage() {
  const navigate = useNavigate();
  const [mediaKind, setMediaKind] = useState<RecentMediaKind>('live');
  const [playingId, setPlayingId] = useState<number | null>(null);

  const {
    sources,
    selectedSourceId,
    recentChannels,
    error,
    settings,
    setError,
    loadSources,
    loadRecents,
    playChannel,
  } = useAppStore(
    useShallow((state) => ({
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      recentChannels: state.recentChannels,
      error: state.error,
      settings: state.settings,
      setError: state.setError,
      loadSources: state.loadSources,
      loadRecents: state.loadRecents,
      playChannel: state.playChannel,
    }))
  );

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [sources, selectedSourceId]
  );
  const copy = RECENT_MEDIA[mediaKind];
  const filteredRecents = useMemo(() => {
    if (selectedSourceId === null) {
      return [];
    }

    return recentChannels.filter(
      (recent) =>
        recent.channel.source_id === selectedSourceId &&
        recent.channel.media_kind === mediaKind
    );
  }, [mediaKind, recentChannels, selectedSourceId]);

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate('/', { replace: true });
      return;
    }

    void loadSources().catch((err) => setError(String(err)));
    void loadRecents().catch((err) => setError(String(err)));
  }, [loadRecents, loadSources, navigate, selectedSourceId, setError]);

  useBackendEvents(
    (backendEvent: BackendEvent) => {
      if (backendEvent.event === 'recents_updated') {
        void loadRecents().catch((err) => setError(String(err)));
      }
    },
    (err) => setError(String(err))
  );

  const handlePlayRecent = useCallback(
    async (recent: RecentChannelRecord) => {
      setPlayingId(recent.channel.id);
      await playChannel(recent.channel.id);
      if (settings.preferred_player === 'web') {
        navigate('/dashboard/player', {
          state: {
            returnTo: '/dashboard/recents',
          },
        });
      }
      setPlayingId(null);
    },
    [navigate, playChannel, settings.preferred_player]
  );

  return (
    <main className="box-border h-full overflow-hidden p-4 md:p-6">
      <section className="flex min-h-0 flex-col gap-4">
        <header className="space-y-3">
          <PageHeader
            title="Watch history"
            description={
              selectedSourceId === null
                ? 'Select a source to see what you watched.'
                : `What you watched on ${selectedSource?.name ?? 'this source'}, newest first.`
            }
          />
          <div className="flex flex-wrap gap-2">
            {(Object.entries(RECENT_MEDIA) as Array<
              [RecentMediaKind, RecentMediaCopy]
            >).map(([key, nextCopy]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={mediaKind === key ? 'default' : 'outline'}
                onClick={() => setMediaKind(key)}
              >
                {nextCopy.label}
              </Button>
            ))}
          </div>
        </header>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Recent {copy.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemGroup className="max-h-[68vh] gap-2 overflow-y-auto">
              {filteredRecents.map((recent) => (
                <Item
                  key={`${recent.channel.id}-${recent.played_at}`}
                  variant={
                    playingId === recent.channel.id ? 'outline-selected' : 'outline'
                  }
                  size="sm"
                >
                  <ItemContent
                    className="cursor-pointer"
                    onClick={() => void handlePlayRecent(recent)}
                  >
                    <ItemTitle>{displayTitle(recent.channel.name)}</ItemTitle>
                    <ItemDescription>
                      {formatPlayedAt(recent.played_at)} ·{' '}
                      {displayTitle(recent.channel.group_name)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}

              {filteredRecents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selectedSourceId === null
                    ? 'Select a source to show recent items.'
                    : `No recently watched ${copy.emptyLabel} yet.`}
                </p>
              ) : null}
            </ItemGroup>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
