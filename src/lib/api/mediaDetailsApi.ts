import { openUrl } from '@tauri-apps/plugin-opener';
import type { MediaDetails } from '@/components/app/types';
import { tauriInvoke } from '../tauriClient';

/**
 * Plot, credits, artwork and rating for a movie or series. `null` when the
 * item's source has no details API (playlists, live channels).
 */
export function getMediaDetails(channelId: number) {
  return tauriInvoke<MediaDetails | null>('get_media_details', { channelId });
}

/** Trailers are YouTube links; they open in the default browser. */
export function openTrailer(url: string): Promise<void> {
  return openUrl(url);
}
