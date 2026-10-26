import { useEffect, useState } from 'react';
import type { ChannelRecord } from '@/components/app/types';
import type { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';
import { listSourceChannels } from '@/lib/api/channelsApi';
import { listSourceGroups } from '@/lib/api/sourcesApi';

export type CatalogCounts = Record<MediaCatalogKind, number>;

type HomeDashboardData = {
  sourceId: number | null;
  counts: CatalogCounts | null;
  favoriteChannels: ChannelRecord[];
};

const EMPTY: HomeDashboardData = {
  sourceId: null,
  counts: null,
  favoriteChannels: [],
};

const KINDS: MediaCatalogKind[] = ['live', 'movie', 'series'];

async function loadCounts(sourceId: number): Promise<CatalogCounts> {
  const totals = await Promise.all(
    KINDS.map(async (kind) => {
      const groups = await listSourceGroups(sourceId, kind);
      return groups.reduce((sum, group) => sum + group.channel_count, 0);
    })
  );
  return { live: totals[0], movie: totals[1], series: totals[2] };
}

/** Catalog totals and favorite channels for the home dashboard. */
export function useHomeDashboardData(sourceId: number | null) {
  const [data, setData] = useState<HomeDashboardData>(EMPTY);

  useEffect(() => {
    if (sourceId === null) {
      return;
    }

    let cancelled = false;
    void Promise.all([
      loadCounts(sourceId).catch(() => null),
      listSourceChannels({
        sourceId,
        mediaKind: 'live',
        groupName: null,
        query: null,
        favoritesOnly: true,
      }).catch(() => [] as ChannelRecord[]),
    ]).then(([counts, favoriteChannels]) => {
      if (!cancelled) {
        setData({ sourceId, counts, favoriteChannels });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  const isCurrent = data.sourceId === sourceId;
  return {
    loading: sourceId !== null && !isCurrent,
    counts: isCurrent ? data.counts : null,
    favoriteChannels: isCurrent ? data.favoriteChannels : [],
  };
}
