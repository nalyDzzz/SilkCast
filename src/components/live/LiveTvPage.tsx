import { useMemo, useState } from 'react';
import { CalendarClock, Heart, ListVideo } from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { FilterChip, FilterField } from '@/components/catalog/CatalogFilters';
import { GroupPicker } from '@/components/catalog/GroupPicker';
import { useNowSeconds } from '@/components/epg/useChannelSchedules';
import { LiveChannelList } from '@/components/live/LiveChannelList';
import { LiveGuide } from '@/components/live/LiveGuide';
import { LivePreview } from '@/components/live/LivePreview';
import { readScrollOffset, writeScrollOffset } from '@/components/media/catalogViewStore';
import { useMediaCatalog } from '@/components/media/hooks/useMediaCatalog';
import { useSourceActions } from '@/components/sources/useSourceActions';
import { Button } from '@/components/ui/button';
import { cleanName } from '@/lib/catalog/cleanName';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';

type LiveView = 'channels' | 'guide';
const VIEW_KEY = 'silkcast:liveView';
const MAX_REGION_CHIPS = 5;

function readView(): LiveView {
  return typeof window !== 'undefined' && window.localStorage.getItem(VIEW_KEY) === 'guide' ? 'guide' : 'channels';
}

function ViewSwitch({ view, onChange }: { view: LiveView; onChange: (view: LiveView) => void }) {
  const options: { value: LiveView; label: string; icon: typeof ListVideo }[] = [
    { value: 'channels', label: 'Channels', icon: ListVideo },
    { value: 'guide', label: 'Guide', icon: CalendarClock },
  ];
  return (
    <div role="tablist" aria-label="Live TV view" className="flex h-10 shrink-0 items-center rounded-lg border border-border bg-card p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={view === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4',
            view === option.value ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <option.icon />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Live TV: a channel list with a preview stage, or a timeline guide. */
export function LiveTvPage() {
  const catalog = useMediaCatalog('live');
  const { copy, filters, data, playback, selectedSource, scrollKey } = catalog;
  const sourceActions = useSourceActions();
  const openChannelInMpv = useAppStore((state) => state.openChannelInMpv);
  const nowSeconds = useNowSeconds(30_000);
  const [view, setViewState] = useState<LiveView>(readView);
  const [region, setRegion] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(catalog.activeItemId);
  const guideEnabled = selectedSource?.supports_guide ?? false;

  const setView = (next: LiveView) => {
    setViewState(next);
    window.localStorage.setItem(VIEW_KEY, next);
  };

  const regions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data.items) {
      const code = cleanName(item.name).region ?? cleanName(item.group_name).region;
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_REGION_CHIPS)
      .map(([code]) => code);
  }, [data.items]);

  const channels = useMemo(
    () =>
      region === null
        ? data.items
        : data.items.filter(
            (item) => (cleanName(item.name).region ?? cleanName(item.group_name).region) === region
          ),
    [data.items, region]
  );

  const selected: ChannelRecord | null =
    channels.find((channel) => channel.id === selectedId) ?? channels[0] ?? null;

  const watch = (channel: ChannelRecord) => void playback.handlePlayItem(channel, channels);
  const toggleFavorite = (channel: ChannelRecord) => void data.handleToggleFavorite(channel);
  const listKey = `${scrollKey}|${region ?? '*'}`;

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 px-6 pt-5 pb-6 lg:px-8">
      <h1 className="sr-only">{copy.title}</h1>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <ViewSwitch view={view} onChange={setView} />
        <GroupPicker
          groups={data.groups}
          selectedGroup={filters.selectedGroup}
          allGroupsValue={copy.allGroupsValue}
          allLabel="All channels"
          onSelect={filters.setSelectedGroup}
          disabled={catalog.selectedSourceId === null}
        />
        <FilterField
          value={filters.query}
          onChange={filters.setQuery}
          placeholder={copy.searchPlaceholder}
          disabled={catalog.selectedSourceId === null}
          className="w-56"
        />
        <FilterChip active={filters.favoritesOnly} onClick={() => filters.setFavoritesOnly(!filters.favoritesOnly)}>
          <Heart className={cn(filters.favoritesOnly && 'fill-thread text-thread')} />
          Favorites
        </FilterChip>
        {regions.length > 1
          ? regions.map((code) => (
              <FilterChip key={code} active={region === code} onClick={() => setRegion(region === code ? null : code)}>
                {code}
              </FilterChip>
            ))
          : null}
        <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
          {data.loading ? 'Loading channels…' : `${channels.length.toLocaleString()} ${copy.pluralLabel}`}
        </span>
      </div>

      {data.error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {data.error}
        </p>
      ) : null}

      {!data.loading && channels.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="font-semibold">No channels match these filters.</p>
          <p className="text-sm text-muted-foreground">Try another group, or clear the filter and favorites.</p>
          <Button
            variant="secondary"
            onClick={() => {
              filters.setQuery('');
              filters.setFavoritesOnly(false);
              filters.setSelectedGroup(copy.allGroupsValue);
              setRegion(null);
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : view === 'guide' ? (
        <div className="min-h-0 flex-1">
          <LiveGuide channels={channels} nowSeconds={nowSeconds} guideEnabled={guideEnabled} onPlay={watch} />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-6">
          <div className="min-h-0 overflow-y-auto pr-1">
            {selected ? (
              <LivePreview
                channel={selected}
                nowSeconds={nowSeconds}
                guideEnabled={guideEnabled}
                guideStatus={sourceActions.guideStatus}
                isRefreshingGuide={sourceActions.isRefreshingGuide}
                mpvAvailable={catalog.mpvAvailable}
                onWatch={watch}
                onToggleFavorite={toggleFavorite}
                onOpenInMpv={(channel) => void openChannelInMpv(channel)}
                onRefreshGuide={() => void sourceActions.refreshGuide()}
              />
            ) : null}
          </div>
          <div className="min-h-0 rounded-2xl border border-border bg-card/50">
            <LiveChannelList
              key={listKey}
              channels={channels}
              selectedId={selected?.id ?? null}
              playingId={playback.playingItemId ?? catalog.activeItemId}
              nowSeconds={nowSeconds}
              guideEnabled={guideEnabled}
              onSelect={(channel) => setSelectedId(channel.id)}
              onWatch={watch}
              initialScrollOffset={readScrollOffset(listKey)}
              onScrollOffsetChange={(offset) => writeScrollOffset(listKey, offset)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
