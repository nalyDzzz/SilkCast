import { useCallback } from 'react';
import type { ChannelRecord } from '@/components/app/types';
import { resolveCatalogView, useCatalogViewStore } from '@/components/media/catalogViewStore';
import type { MediaCatalogKind } from '@/components/media/mediaCatalogConfig';

type UseCatalogDetailsViewArgs = {
  mediaKind: MediaCatalogKind;
  selectedSourceId: number | null;
  /** Resolves true when the favorite was saved. */
  toggleFavorite: (item: ChannelRecord) => Promise<boolean>;
};

/**
 * Which movie's details page is open, and favoriting the item on a details
 * page (movie or series). The open item lives in the catalog view store, so
 * the page is still open after the player closes.
 */
export function useCatalogDetailsView({ mediaKind, selectedSourceId, toggleFavorite }: UseCatalogDetailsViewArgs) {
  const storedView = useCatalogViewStore((state) => state.views[mediaKind]);
  const updateView = useCatalogViewStore((state) => state.updateView);
  const selectedMovie =
    mediaKind === 'movie' ? resolveCatalogView(storedView, selectedSourceId).selectedItem : null;

  const openMovie = useCallback(
    (item: ChannelRecord) => updateView(mediaKind, selectedSourceId, { selectedItem: item }),
    [mediaKind, selectedSourceId, updateView]
  );

  const closeMovie = useCallback(
    () => updateView(mediaKind, selectedSourceId, { selectedItem: null }),
    [mediaKind, selectedSourceId, updateView]
  );

  const toggleDetailsFavorite = useCallback(
    async (item: ChannelRecord) => {
      if (!(await toggleFavorite(item))) {
        return;
      }
      const view = resolveCatalogView(useCatalogViewStore.getState().views[mediaKind], selectedSourceId);
      if (view.selectedItem?.id === item.id) {
        updateView(mediaKind, selectedSourceId, {
          selectedItem: { ...view.selectedItem, is_favorite: !item.is_favorite },
        });
      }
    },
    [mediaKind, selectedSourceId, toggleFavorite, updateView]
  );

  return { selectedMovie, openMovie, closeMovie, toggleDetailsFavorite };
}
