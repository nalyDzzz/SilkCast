import {
  ChannelEpgRecord,
  GuideRefreshStarted,
  LiveEpgEntryRecord,
} from '@/components/app/types';
import { tauriInvoke } from '../tauriClient';

/** Stored programmes still on for one channel (now, next, ...). */
export function listChannelEpg(channelId: number, limit = 2) {
  return tauriInvoke<LiveEpgEntryRecord[]>('list_channel_epg', {
    channelId,
    limit,
  });
}

/**
 * Stored programmes overlapping `[from, to)` (unix seconds) for several
 * channels in one call. Channels without programmes are left out.
 */
export function listChannelsEpg(channelIds: number[], from: number, to: number) {
  return tauriInvoke<ChannelEpgRecord[]>('list_channels_epg', {
    channelIds,
    from: Math.floor(from),
    to: Math.ceil(to),
  });
}

export function refreshChannelEpg(channelId: number, limit = 2) {
  return tauriInvoke<LiveEpgEntryRecord[]>('refresh_channel_epg', {
    channelId,
    limit,
  });
}

/**
 * Starts refreshing a source's guide in the background. Progress arrives as
 * `epg_progress` events and the result as `epg_updated`.
 */
export function refreshSourceEpg(sourceId: number) {
  return tauriInvoke<GuideRefreshStarted>('refresh_source_epg', {
    sourceId,
  });
}
