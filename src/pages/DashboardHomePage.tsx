import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { Film, Tv, TvMinimal } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { useChannelSchedules, useNowSeconds } from '@/components/epg/useChannelSchedules';
import { ContinueCard, HomeRail, LibraryTile, OnNowCard } from '@/components/home/HomeCards';
import { type HeroFeature, HomeHero } from '@/components/home/HomeHero';
import { continueItems, onNowChannels } from '@/components/home/homeItems';
import { useHomeDashboardData } from '@/components/home/useHomeDashboardData';
import { useCatalogViewStore } from '@/components/media/catalogViewStore';
import { MEDIA_PATH } from '@/components/media/mediaCatalogConfig';
import { Button } from '@/components/ui/button';
import { useOpenCatalogItem } from '@/hooks/useOpenCatalogItem';
import { scheduleSlots } from '@/lib/epg/schedule';
import { getResumeEntries } from '@/lib/player/playerStorage';
import { useAppStore } from '@/store/appStore';

const CONTINUE_LIMIT = 12;
const ON_NOW_LIMIT = 12;

export function DashboardHomePage() {
  const navigate = useNavigate();
  const { sources, selectedSourceId, recentChannels, loadRecents } = useAppStore(
    useShallow((state) => ({
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      recentChannels: state.recentChannels,
      loadRecents: state.loadRecents,
    }))
  );
  const { counts, favoriteChannels, loading } = useHomeDashboardData(selectedSourceId);
  const { open } = useOpenCatalogItem();
  const nowSeconds = useNowSeconds();

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate('/', { replace: true });
      return;
    }
    void loadRecents().catch(() => undefined);
  }, [loadRecents, navigate, selectedSourceId]);

  const source = sources.find((item) => item.id === selectedSourceId) ?? null;
  const resumeEntries = useMemo(() => getResumeEntries(), []);

  const continueList = useMemo(
    () => continueItems(recentChannels, selectedSourceId, resumeEntries, CONTINUE_LIMIT),
    [recentChannels, resumeEntries, selectedSourceId]
  );
  const liveChannels = useMemo(
    () => onNowChannels(favoriteChannels, recentChannels, selectedSourceId, ON_NOW_LIMIT),
    [favoriteChannels, recentChannels, selectedSourceId]
  );
  const schedules = useChannelSchedules(
    liveChannels.map((channel) => channel.id),
    { enabled: source?.supports_guide ?? false }
  );
  const nowFor = (channel: ChannelRecord) =>
    scheduleSlots(schedules[channel.id] ?? [], nowSeconds).now;

  const feature: HeroFeature = (() => {
    const resume = continueList.find((entry) => entry.progress !== null) ?? continueList[0];
    if (resume) return { kind: 'resume', entry: resume };
    const live = liveChannels.find((channel) => nowFor(channel) !== null);
    const programme = live ? nowFor(live) : null;
    if (live && programme) return { kind: 'live', channel: live, programme };
    return { kind: 'welcome' };
  })();

  const openItem = (item: ChannelRecord) =>
    void open(item, item.media_kind === 'live' ? liveChannels : undefined);

  const browseGroup = (item: ChannelRecord) => {
    useCatalogViewStore
      .getState()
      .updateView(item.media_kind, selectedSourceId, { group: item.group_name, selectedSeries: null });
    navigate(MEDIA_PATH[item.media_kind]);
  };

  return (
    <main className="pb-12">
      <HomeHero feature={feature} nowSeconds={nowSeconds} onOpen={openItem} onBrowseGroup={browseGroup} />

      <div className="relative z-10 -mt-4 space-y-9">
        {continueList.length > 0 ? (
          <HomeRail
            title="Continue watching"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard/recents">Watch history</Link>
              </Button>
            }
          >
            {continueList.map((entry) => (
              <ContinueCard key={entry.item.id} entry={entry} onOpen={openItem} />
            ))}
          </HomeRail>
        ) : null}

        {liveChannels.length > 0 ? (
          <HomeRail
            title="On now"
            subtitle={favoriteChannels.length > 0 ? 'Favorites and recent channels' : 'Recent channels'}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard/live">Browse Live TV</Link>
              </Button>
            }
          >
            {liveChannels.map((channel) => (
              <OnNowCard
                key={channel.id}
                channel={channel}
                programme={nowFor(channel)}
                nowSeconds={nowSeconds}
                onPlay={openItem}
              />
            ))}
          </HomeRail>
        ) : null}

        <section className="space-y-3 px-8">
          <h2 className="text-lg font-semibold tracking-tight">
            Library
            {source ? <span className="ml-3 text-sm font-normal text-muted-foreground">{source.name}</span> : null}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <LibraryTile to="/dashboard/live" icon={<Tv />} label="Live TV" count={loading ? undefined : (counts?.live ?? null)} />
            <LibraryTile to="/dashboard/movies" icon={<Film />} label="Movies" count={loading ? undefined : (counts?.movie ?? null)} />
            <LibraryTile to="/dashboard/series" icon={<TvMinimal />} label="Series" count={loading ? undefined : (counts?.series ?? null)} />
          </div>
        </section>
      </div>
    </main>
  );
}
