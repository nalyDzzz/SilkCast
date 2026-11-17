import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { ChannelRecord } from '@/components/app/types';
import { useCatalogViewStore } from '@/components/media/catalogViewStore';
import { MEDIA_PATH } from '@/components/media/mediaCatalogConfig';
import { displayTitle } from '@/lib/catalog/cleanName';
import { useAppStore } from '@/store/appStore';

/**
 * Opens a catalog item the way its kind expects: movies and Xtream series open
 * their details page, channels start playing (in-app player or MPV).
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
      const hasDetailsPage =
        item.media_kind === 'movie' ||
        (item.media_kind === 'series' && source?.source_type === 'xtream');
      if (item.media_kind !== 'live' && hasDetailsPage) {
        useCatalogViewStore
          .getState()
          .updateView(item.media_kind, selectedSourceId, { selectedItem: item });
        navigate(MEDIA_PATH[item.media_kind]);
        return;
      }
      await play(item, queue);
    },
    [navigate, play]
  );

  return { open, play };
}
