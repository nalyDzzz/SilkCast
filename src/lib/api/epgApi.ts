import {
  ChannelEpgRecord,
  LiveEpgEntryRecord,
  SourceEpgRefreshResult,
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

export function refreshSourceEpg(sourceId: number) {
  return tauriInvoke<SourceEpgRefreshResult>('refresh_source_epg', {
    sourceId,
  });
}
