import {
  LiveEpgEntryRecord,
  SourceEpgRefreshResult,
} from '@/components/app/types';
import { tauriInvoke } from '../tauriClient';

export function listChannelEpg(channelId: number, limit = 2) {
  return tauriInvoke<LiveEpgEntryRecord[]>('list_channel_epg', {
    channelId,
    limit,
  });
}

export function refreshChannelEpg(channelId: number, limit = 2) {
  return tauriInvoke<LiveEpgEntryRecord[]>('refresh_channel_epg', {
    channelId,
    limit,
  });
}

export function refreshSourceEpg(sourceId: number, limit = 2) {
  return tauriInvoke<SourceEpgRefreshResult>('refresh_source_epg', {
    sourceId,
    limit,
  });
}
