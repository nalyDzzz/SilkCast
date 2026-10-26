import { invalidateSourceCatalog } from '@/components/media/catalogViewStore';
import { useBackendEvents } from '@/hooks/useBackendEvents';

/** Backend events meaning a source's catalog (and its channel ids) changed. */
const CATALOG_CHANGE_EVENTS = new Set([
  'sources_updated',
  'channels_updated',
  'groups_updated',
]);

/**
 * Keeps cached catalog state honest app-wide. Refreshing, editing, or deleting
 * a source re-imports its channels with new ids, wherever the user is.
 */
export function useCatalogInvalidation() {
  useBackendEvents((event) => {
    if (!CATALOG_CHANGE_EVENTS.has(event.event)) {
      return;
    }

    const sourceId = event.payload['source_id'];
    invalidateSourceCatalog(typeof sourceId === 'number' ? sourceId : null);
  });
}
