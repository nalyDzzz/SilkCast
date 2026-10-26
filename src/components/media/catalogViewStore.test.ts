import { describe, expect, it } from 'vitest';
import type { ChannelRecord } from '@/components/app/types';
import {
  catalogResultCache,
  invalidateSourceCatalog,
  resolveCatalogView,
  useCatalogViewStore,
} from '@/components/media/catalogViewStore';

const series: ChannelRecord = {
  id: 77,
  source_id: 5,
  name: 'Show',
  group_name: 'Drama',
  logo: null,
  tvg_id: null,
  tvg_name: null,
  stream_url: 'http://host/series/u/p/77.mp4',
  media_kind: 'series',
  is_favorite: false,
};

describe('catalogViewStore', () => {
  it('starts a fresh view after switching sources', () => {
    const { updateView } = useCatalogViewStore.getState();
    updateView('movie', 5, { query: 'alien', favoritesOnly: true });

    const stored = useCatalogViewStore.getState().views.movie;
    expect(resolveCatalogView(stored, 5)).toMatchObject({
      query: 'alien',
      favoritesOnly: true,
    });
    expect(resolveCatalogView(stored, 6)).toMatchObject({
      query: '',
      favoritesOnly: false,
    });
  });

  it('drops stale ids and cached results when a source catalog changes', () => {
    const store = useCatalogViewStore.getState();
    store.updateView('series', 5, { selectedSeries: series, query: 'sh' });
    store.cacheEpisodes(77, []);
    catalogResultCache.rememberItems('5|series||sh|false', [series]);
    const versionBefore = useCatalogViewStore.getState().catalogVersion;

    invalidateSourceCatalog(5);

    const state = useCatalogViewStore.getState();
    expect(state.views.series).toMatchObject({
      selectedSeries: null,
      query: 'sh',
    });
    expect(state.episodesBySeriesId).toEqual({});
    expect(state.catalogVersion).toBe(versionBefore + 1);
    expect(catalogResultCache.readItems('5|series||sh|false')).toBeUndefined();
  });

  it('leaves other sources’ open series alone', () => {
    useCatalogViewStore.getState().updateView('series', 5, {
      selectedSeries: series,
    });

    invalidateSourceCatalog(9);

    expect(useCatalogViewStore.getState().views.series?.selectedSeries).toBe(
      series
    );
  });
});
