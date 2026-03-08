import { tauriInvoke } from '../tauriClient';
import {
  GroupRecord,
  SourceImportResult,
  SourceRecord,
} from '@/components/app/types';

export function listRegisteredSources() {
  return tauriInvoke<SourceRecord[]>('list_registered_sources');
}

export function listSourceGroups(
  sourceId: number,
  mediaKind: 'live' | 'movie' | 'series' | null = null
) {
  return tauriInvoke<GroupRecord[]>('list_source_groups', {
    sourceId,
    mediaKind,
  });
}

export function addM3uSource(name: string, location: string) {
  return tauriInvoke<SourceImportResult>('add_m3u_source', { name, location });
}

export function addXtreamSource(
  name: string,
  serverUrl: string,
  username: string,
  password: string
) {
  return tauriInvoke<SourceImportResult>('add_xtream_source', {
    name,
    serverUrl,
    username,
    password,
  });
}

export function updateRegisteredSource(
  sourceId: number,
  name: string,
  config: Record<string, unknown>
) {
  return tauriInvoke<SourceImportResult>('update_registered_source', {
    sourceId,
    name,
    config,
  });
}

export function refreshRegisteredSource(sourceId: number) {
  return tauriInvoke<SourceImportResult>('refresh_registered_source', {
    sourceId,
  });
}

export function deleteRegisteredSource(sourceId: number) {
  return tauriInvoke<void>('delete_registered_source', { sourceId });
}
