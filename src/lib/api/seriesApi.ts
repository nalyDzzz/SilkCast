import { SeriesEpisodeRecord } from '@/components/app/types';
import { tauriInvoke } from '../tauriClient';

export function listSeriesEpisodes(channelId: number) {
  return tauriInvoke<SeriesEpisodeRecord[]>('list_series_episodes', {
    channelId,
  });
}
