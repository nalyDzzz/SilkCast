import { create } from 'zustand';
import type {
  ChannelRecord,
  GroupRecord,
  SeriesEpisodeRecord,
} from '@/components/app/types';
import type { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';

/**
 * Per-catalog browsing state that must survive leaving the page (e.g. opening
 * the player and coming back): filters and the series being browsed.
 */
export type CatalogView = {
  sourceId: number | null;
  /** Group name, or null for all groups. */
  group: string | null;
  query: string;
  favoritesOnly: boolean;
  selectedSeries: ChannelRecord | null;
};

type CatalogViewStore = {
  views: Partial<Record<MediaCatalogKind, CatalogView>>;
  /** Bumped when catalogs must refetch (source refreshed, edited, deleted). */
  catalogVersion: number;
  episodesBySeriesId: Record<number, SeriesEpisodeRecord[]>;
  updateView: (
    kind: MediaCatalogKind,
    sourceId: number | null,
    patch: Partial<Omit<CatalogView, 'sourceId'>>
  ) => void;
  cacheEpisodes: (seriesId: number, episodes: SeriesEpisodeRecord[]) => void;
};

export function defaultCatalogView(sourceId: number | null): CatalogView {
  return {
    sourceId,
    group: null,
    query: '',
    favoritesOnly: false,
    selectedSeries: null,
  };
}

/** The stored view for this source, or a fresh one after switching sources. */
export function resolveCatalogView(
  stored: CatalogView | undefined,
  sourceId: number | null
): CatalogView {
  return stored && stored.sourceId === sourceId
    ? stored
    : defaultCatalogView(sourceId);
}

export const useCatalogViewStore = create<CatalogViewStore>((set) => ({
  views: {},
  catalogVersion: 0,
  episodesBySeriesId: {},
  updateView: (kind, sourceId, patch) =>
    set((state) => ({
      views: {
        ...state.views,
        [kind]: {
          ...resolveCatalogView(state.views[kind], sourceId),
          ...patch,
          sourceId,
        },
      },
    })),
  cacheEpisodes: (seriesId, episodes) =>
    set((state) => ({
      episodesBySeriesId: {
        ...state.episodesBySeriesId,
        [seriesId]: episodes,
      },
    })),
}));

/** Non-reactive scroll positions, read once when a list mounts. */
const scrollOffsets = new Map<string, number>();

export function catalogScrollKey(
  kind: MediaCatalogKind,
  view: CatalogView,
  suffix = ''
) {
  return [
    kind,
    view.sourceId ?? 'none',
    view.group ?? '*',
    view.query.trim().toLowerCase(),
    view.favoritesOnly ? 'fav' : 'all',
    suffix,
  ].join('|');
}

export function readScrollOffset(key: string) {
  return scrollOffsets.get(key) ?? 0;
}

export function writeScrollOffset(key: string, offset: number) {
  scrollOffsets.set(key, offset);
}

const MAX_CACHED_RESULTS = 12;

/**
 * Last catalog results per query, so returning to a catalog (e.g. from the
 * player) renders immediately and can restore its scroll position while it
 * revalidates. Cleared whenever a source's catalog changes.
 */
const itemsCache = new Map<string, ChannelRecord[]>();
const groupsCache = new Map<string, GroupRecord[]>();

function remember<T>(cache: Map<string, T>, key: string, value: T) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_CACHED_RESULTS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
}

export const catalogResultCache = {
  readItems: (key: string) => itemsCache.get(key),
  rememberItems: (key: string, items: ChannelRecord[]) =>
    remember(itemsCache, key, items),
  readGroups: (key: string) => groupsCache.get(key),
  rememberGroups: (key: string, groups: GroupRecord[]) =>
    remember(groupsCache, key, groups),
  clear: () => {
    itemsCache.clear();
    groupsCache.clear();
  },
};

/**
 * A source's catalog was re-imported or removed: channel ids changed, so drop
 * cached results, cached episodes, and any open series, and tell mounted
 * catalogs to refetch.
 */
export function invalidateSourceCatalog(sourceId: number | null) {
  catalogResultCache.clear();
  scrollOffsets.clear();
  useCatalogViewStore.setState((state) => {
    const views = { ...state.views };
    for (const kind of Object.keys(views) as MediaCatalogKind[]) {
      const view = views[kind];
      if (view && (sourceId === null || view.sourceId === sourceId)) {
        views[kind] = { ...view, selectedSeries: null };
      }
    }
    return {
      views,
      episodesBySeriesId: {},
      catalogVersion: state.catalogVersion + 1,
    };
  });
}
