import { tauriInvoke } from '../tauriClient';
import {
  GroupRecord,
  M3uImportResult,
  SourceRecord,
} from '@/components/app/types';

export function listRegisteredSources() {
  return tauriInvoke<SourceRecord[]>('list_registered_sources');
}

export function listSourceGroups(
  sourceId: number,
  mediaKind: "live" | "movie" | "series" | null = null
) {
  return tauriInvoke<GroupRecord[]>('list_source_groups', { sourceId, mediaKind });
}

export function addM3uSource(name: string, location: string) {
  return tauriInvoke<M3uImportResult>('add_m3u_source', { name, location });
}

export function refreshM3uSource(sourceId: number) {
  return tauriInvoke<M3uImportResult>('refresh_m3u_source', { sourceId });
}

export function deleteRegisteredSource(sourceId: number) {
  return tauriInvoke<void>('delete_registered_source', { sourceId });
}
