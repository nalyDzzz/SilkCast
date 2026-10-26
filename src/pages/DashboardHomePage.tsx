import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { CircleHelp, Film, Heart, Tv, TvMinimal } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import {
  BrowseTile,
  ChannelTile,
  MediaRail,
  PosterTile,
} from '@/components/home/HomeTiles';
import { useHomeDashboardData } from '@/components/home/useHomeDashboardData';
import { useCatalogViewStore } from '@/components/media/catalogViewStore';
import { resumeKeyFor } from '@/components/player/hooks/useResumeTracking';
import { Button } from '@/components/ui/button';
import { getResumeEntries } from '@/lib/player/playerStorage';
import { useAppStore } from '@/store/appStore';

const RAIL_LIMIT = 15;

function uniqueById(items: ChannelRecord[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function DashboardHomePage() {
  const navigate = useNavigate();
  const {
    sources,
    selectedSourceId,
    recentChannels,
    preferredPlayer,
    loadRecents,
    playChannelRecord,
  } = useAppStore(
    useShallow((state) => ({
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      recentChannels: state.recentChannels,
      preferredPlayer: state.settings.preferred_player,
      loadRecents: state.loadRecents,
      playChannelRecord: state.playChannelRecord,
    }))
  );
  const { counts, favoriteChannels, loading } =
    useHomeDashboardData(selectedSourceId);

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate('/', { replace: true });
      return;
    }
    void loadRecents().catch(() => undefined);
  }, [loadRecents, navigate, selectedSourceId]);

  const source = sources.find((item) => item.id === selectedSourceId) ?? null;

  const { recentLive, continueWatching } = useMemo(() => {
    const forSource = recentChannels
      .filter((recent) => recent.channel.source_id === selectedSourceId)
      .map((recent) => recent.channel);
    return {
      recentLive: uniqueById(
        forSource.filter((item) => item.media_kind === 'live')
      ).slice(0, RAIL_LIMIT),
      continueWatching: uniqueById(
        forSource.filter((item) => item.media_kind !== 'live')
      ).slice(0, RAIL_LIMIT),
    };
  }, [recentChannels, selectedSourceId]);

  const resumeEntries = useMemo(() => getResumeEntries(), []);

  const play = async (item: ChannelRecord, queue?: ChannelRecord[]) => {
    await playChannelRecord(item, queue);
    const { error } = useAppStore.getState();
    if (error !== null) {
      toast.error("Couldn't start playback", { description: error });
      return;
    }

    if (preferredPlayer === 'web') {
      navigate('/dashboard/player', { state: { returnTo: '/dashboard' } });
    } else {
      toast.success(`Playing "${item.name}" in MPV`);
    }
  };

  const openContinueItem = (item: ChannelRecord) => {
    if (item.media_kind === 'series' && source?.source_type === 'xtream') {
      useCatalogViewStore
        .getState()
        .updateView('series', selectedSourceId, { selectedSeries: item });
      navigate('/dashboard/series');
      return;
    }
    void play(item);
  };

  const progressFor = (item: ChannelRecord) => {
    if (item.media_kind !== 'movie') {
      return null;
    }
    const entry = resumeEntries[resumeKeyFor(item)];
    return entry ? Math.min(entry.position / entry.duration, 1) : null;
  };

  const isEmpty =
    !loading &&
    recentLive.length === 0 &&
    continueWatching.length === 0 &&
    favoriteChannels.length === 0;

  return (
    <main className="p-4 md:p-6">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Home
          </h1>
          <p className="text-sm text-muted-foreground">
            {source ? `Watching from ${source.name}` : 'Loading your source…'}
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <BrowseTile
            to="/dashboard/live"
            icon={<Tv />}
            label="Live TV"
            count={loading ? undefined : (counts?.live ?? null)}
          />
          <BrowseTile
            to="/dashboard/movies"
            icon={<Film />}
            label="Movies"
            count={loading ? undefined : (counts?.movie ?? null)}
          />
          <BrowseTile
            to="/dashboard/series"
            icon={<TvMinimal />}
            label="Series"
            count={loading ? undefined : (counts?.series ?? null)}
          />
        </div>

        {continueWatching.length > 0 ? (
          <MediaRail
            title="Continue watching"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard/recents">See all</Link>
              </Button>
            }
          >
            {continueWatching.map((item) => (
              <PosterTile
                key={item.id}
                item={item}
                progress={progressFor(item)}
                subtitle={item.media_kind === 'series' ? 'Series' : 'Movie'}
                onSelect={openContinueItem}
              />
            ))}
          </MediaRail>
        ) : null}

        {recentLive.length > 0 ? (
          <MediaRail title="Recent channels">
            {recentLive.map((channel) => (
              <ChannelTile
                key={channel.id}
                channel={channel}
                onPlay={(item) => void play(item, recentLive)}
              />
            ))}
          </MediaRail>
        ) : null}

        {favoriteChannels.length > 0 ? (
          <MediaRail
            title="Favorite channels"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard/live">Browse all</Link>
              </Button>
            }
          >
            {favoriteChannels.slice(0, 30).map((channel) => (
              <ChannelTile
                key={channel.id}
                channel={channel}
                onPlay={(item) => void play(item, favoriteChannels)}
              />
            ))}
          </MediaRail>
        ) : null}

        {isEmpty ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
            <Heart className="size-6 text-muted-foreground" />
            <div className="space-y-1">
              <h2 className="font-semibold">Nothing here yet</h2>
              <p className="text-sm text-muted-foreground">
                Channels you watch and favorite will show up here for one-click
                access. Tap the heart on any channel to favorite it.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/dashboard/live">Browse Live TV</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard/help">
                  <CircleHelp />
                  Read the guide
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
