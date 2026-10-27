import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { ChannelRecord } from '@/components/app/types';
import { useCatalogViewStore } from '@/components/media/catalogViewStore';
import { displayTitle } from '@/lib/catalog/cleanName';
import { useAppStore } from '@/store/appStore';

/**
 * Opens a catalog item the way its kind expects: channels and movies start
 * playing (in-app player or MPV), Xtream series open their episode list.
 */
export function useOpenCatalogItem() {
  const navigate = useNavigate();
  const location = useLocation();

  const play = useCallback(
    async (item: ChannelRecord, queue?: ChannelRecord[]) => {
      await useAppStore.getState().playChannelRecord(item, queue);
      const { error, settings } = useAppStore.getState();
      if (error !== null) {
        toast.error("Couldn't start playback", { description: error });
        return;
      }
      if (settings.preferred_player === 'web') {
        navigate('/dashboard/player', { state: { returnTo: location.pathname } });
      } else {
        toast.success(`Playing "${displayTitle(item.name)}" in MPV`);
      }
    },
    [location.pathname, navigate]
  );

  const open = useCallback(
    async (item: ChannelRecord, queue?: ChannelRecord[]) => {
      const { sources, selectedSourceId } = useAppStore.getState();
      const source = sources.find((candidate) => candidate.id === item.source_id);
      if (item.media_kind === 'series' && source?.source_type === 'xtream') {
        useCatalogViewStore
          .getState()
          .updateView('series', selectedSourceId, { selectedSeries: item });
        navigate('/dashboard/series');
        return;
      }
      await play(item, queue);
    },
    [navigate, play]
  );

  return { open, play };
}
