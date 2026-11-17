import { tauriInvoke } from '../tauriClient';
import { ChannelRecord } from '../../components/app/types';

type ListSourceChannelsArgs = {
  sourceId: number;
  mediaKind?: "live" | "movie" | "series" | null;
  groupName: string | null;
  query: string | null;
  favoritesOnly: boolean;
};

export function listSourceChannels(args: ListSourceChannelsArgs) {
  return tauriInvoke<ChannelRecord[]>('list_source_channels', args);
}

/** Catalog-wide name search, capped at `limitPerKind` matches per media kind. */
export function searchSourceChannels(sourceId: number, query: string, limitPerKind: number) {
  return tauriInvoke<ChannelRecord[]>('search_source_channels', {
    sourceId,
    query,
    limitPerKind,
  });
}

/** Other items from the same group, the ones after `channelId` by name first. */
export function listRelatedItems(channelId: number, limit: number) {
  return tauriInvoke<ChannelRecord[]>('list_related_items', { channelId, limit });
}

export function setChannelFavoriteState(channelId: number, favorite: boolean) {
  return tauriInvoke<void>('set_channel_favorite_state', {
    channelId,
    favorite,
  });
}
