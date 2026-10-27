import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { Command as CommandPrimitive } from 'cmdk';
import {
  CircleHelp,
  Film,
  Folder,
  Home,
  Moon,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  Settings2,
  Sun,
  Tv,
  TvMinimal,
} from 'lucide-react';
import type { ChannelRecord } from '@/components/app/types';
import { TagBadges } from '@/components/catalog/TagBadges';
import { useCommandPaletteStore } from '@/components/command/commandPaletteStore';
import { useAllGroups, useCatalogSearch } from '@/components/command/useCatalogSearch';
import { useCatalogViewStore } from '@/components/media/catalogViewStore';
import type { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { useSourceActions } from '@/components/sources/useSourceActions';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useOpenCatalogItem } from '@/hooks/useOpenCatalogItem';
import { cleanName } from '@/lib/catalog/cleanName';
import { useAppStore } from '@/store/appStore';

const KIND_PATH: Record<MediaCatalogKind, string> = {
  live: '/dashboard/live',
  movie: '/dashboard/movies',
  series: '/dashboard/series',
};
const KIND_LABEL: Record<MediaCatalogKind, string> = {
  live: 'Live TV',
  movie: 'Movies',
  series: 'Series',
};
const KIND_ICON = { live: Tv, movie: Film, series: TvMinimal };
const GROUP_RESULTS = 5;
const RECENT_RESULTS = 5;

const matches = (label: string, query: string) =>
  query === '' || label.toLowerCase().includes(query);

function ItemArt({ item }: { item: ChannelRecord }) {
  const Icon = KIND_ICON[item.media_kind];
  const poster = item.media_kind !== 'live';
  return (
    <span
      className={
        poster
          ? 'grid h-10 w-7 shrink-0 place-items-center overflow-hidden rounded-[4px] bg-muted'
          : 'grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted'
      }
    >
      {item.logo ? (
        <img
          src={item.logo}
          alt=""
          loading="lazy"
          className={poster ? 'size-full object-cover' : 'size-full object-contain p-0.5'}
        />
      ) : (
        <Icon className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}

function CatalogItem({ item, onSelect }: { item: ChannelRecord; onSelect: () => void }) {
  const { title, year, tags } = cleanName(item.name);
  return (
    <CommandItem value={`item-${item.id}`} onSelect={onSelect} className="gap-3 py-1.5">
      <ItemArt item={item} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{title}</span>
          <TagBadges tags={tags} max={2} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[KIND_LABEL[item.media_kind], year, cleanName(item.group_name).title]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </CommandItem>
  );
}

/** Ctrl K: jump to any channel, movie, series or group, and run app actions. */
export function CommandPalette() {
  const navigate = useNavigate();
  const { open, setOpen } = useCommandPaletteStore();
  const [query, setQuery] = useState('');
  const { selectedSourceId, recentChannels, theme, setTheme } = useAppStore(
    useShallow((state) => ({
      selectedSourceId: state.selectedSourceId,
      recentChannels: state.recentChannels,
      theme: state.theme,
      setTheme: state.setTheme,
    }))
  );
  const sourceActions = useSourceActions();
  const { open: openItem } = useOpenCatalogItem();
  const q = query.trim().toLowerCase();

  const { results, searching } = useCatalogSearch(selectedSourceId, query, open);
  const allGroups = useAllGroups(selectedSourceId, open);

  // Global shortcut; a real side effect on the window.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!useCommandPaletteStore.getState().open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  const recents = useMemo(() => {
    const seen = new Set<number>();
    return recentChannels
      .map((recent) => recent.channel)
      .filter((channel) => {
        if (channel.source_id !== selectedSourceId || seen.has(channel.id)) return false;
        seen.add(channel.id);
        return true;
      })
      .slice(0, RECENT_RESULTS);
  }, [recentChannels, selectedSourceId]);

  const groups = useMemo(
    () =>
      q.length < 2
        ? []
        : allGroups
            .filter((group) => !cleanName(group.name).isSeparator)
            .filter((group) => matches(cleanName(group.name).title, q))
            .slice(0, GROUP_RESULTS),
    [allGroups, q]
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const run = (action: () => void | Promise<void>) => () => {
    close();
    void action();
  };
  const goToGroup = (kind: MediaCatalogKind, groupName: string) => {
    useCatalogViewStore
      .getState()
      .updateView(kind, selectedSourceId, { group: groupName, selectedSeries: null });
    navigate(KIND_PATH[kind]);
  };

  const pages = [
    { label: 'Home', icon: Home, to: '/dashboard' },
    { label: 'Live TV', icon: Tv, to: '/dashboard/live' },
    { label: 'Movies', icon: Film, to: '/dashboard/movies' },
    { label: 'Series', icon: TvMinimal, to: '/dashboard/series' },
    { label: 'Settings', icon: Settings, to: '/dashboard/settings' },
    { label: 'Help', icon: CircleHelp, to: '/dashboard/help' },
  ].filter((page) => matches(page.label, q));

  const actions = [
    sourceActions.supportsGuide && {
      label: 'Refresh guide',
      hint: sourceActions.guideStatus,
      icon: RefreshCw,
      run: sourceActions.refreshGuide,
    },
    sourceActions.selectedSource && {
      label: 'Refresh source',
      hint: sourceActions.selectedSource.name,
      icon: RefreshCw,
      run: sourceActions.refreshSource,
    },
    ...sourceActions.otherSources.map((source) => ({
      label: `Switch to ${source.name}`,
      hint: source.source_type === 'xtream' ? 'Xtream provider' : 'M3U playlist',
      icon: Repeat,
      run: () => sourceActions.switchSource(source.id),
    })),
    { label: 'Manage sources', hint: null, icon: Settings2, run: sourceActions.openSourceManager },
    {
      label: theme === 'dark' ? 'Use light theme' : 'Use dark theme',
      hint: null,
      icon: theme === 'dark' ? Sun : Moon,
      run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
  ]
    .filter((action) => Boolean(action))
    .filter((action) => action && matches(action.label, q)) as {
    label: string;
    hint: string | null;
    icon: typeof RefreshCw;
    run: () => void | Promise<void>;
  }[];

  const hasResults = results.live.length + results.movie.length + results.series.length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent
        showCloseButton={false}
        className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search SilkCast</DialogTitle>
        <DialogDescription className="sr-only">
          Search channels, movies, series and groups, or run an action.
        </DialogDescription>
        <Command shouldFilter={false} loop className="bg-popover">
          <div className="flex h-13 items-center gap-3 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search channels, movies and series"
              className="h-full flex-1 bg-transparent text-[15px] outline-hidden placeholder:text-muted-foreground"
            />
            <Kbd>Esc</Kbd>
          </div>
          <CommandList className="max-h-[min(60vh,440px)] p-1.5">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
              {searching ? 'Searching…' : `Nothing matches "${query.trim()}".`}
            </CommandEmpty>

            {q === '' && recents.length > 0 ? (
              <CommandGroup heading="Recently watched">
                {recents.map((item) => (
                  <CatalogItem key={item.id} item={item} onSelect={run(() => openItem(item))} />
                ))}
              </CommandGroup>
            ) : null}

            {(['live', 'movie', 'series'] as const).map((kind) =>
              results[kind].length > 0 ? (
                <CommandGroup key={kind} heading={kind === 'live' ? 'Channels' : KIND_LABEL[kind]}>
                  {results[kind].map((item) => (
                    <CatalogItem
                      key={item.id}
                      item={item}
                      onSelect={run(() => openItem(item, kind === 'live' ? results.live : undefined))}
                    />
                  ))}
                </CommandGroup>
              ) : null
            )}

            {groups.length > 0 ? (
              <CommandGroup heading="Groups">
                {groups.map((group) => {
                  const { title, tags } = cleanName(group.name);
                  return (
                    <CommandItem
                      key={`${group.kind}-${group.name}`}
                      value={`group-${group.kind}-${group.name}`}
                      onSelect={run(() => goToGroup(group.kind, group.name))}
                    >
                      <Folder />
                      <span className="truncate font-medium">{title}</span>
                      <TagBadges tags={tags} max={2} />
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                        {KIND_LABEL[group.kind]} · {group.channel_count.toLocaleString()}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {actions.length > 0 ? (
              <CommandGroup heading="Actions">
                {actions.map((action) => (
                  <CommandItem key={action.label} value={`action-${action.label}`} onSelect={run(action.run)}>
                    <action.icon />
                    <span className="font-medium">{action.label}</span>
                    {action.hint ? (
                      <span className="ml-auto truncate text-xs text-muted-foreground">{action.hint}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {pages.length > 0 && !hasResults ? (
              <CommandGroup heading="Go to">
                {pages.map((page) => (
                  <CommandItem key={page.to} value={`page-${page.to}`} onSelect={run(() => navigate(page.to))}>
                    <page.icon />
                    <span className="font-medium">{page.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> Move
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Enter</Kbd> Open
            </span>
            {sourceActions.selectedSource ? (
              <span className="ml-auto truncate">Searching {sourceActions.selectedSource.name}</span>
            ) : null}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
