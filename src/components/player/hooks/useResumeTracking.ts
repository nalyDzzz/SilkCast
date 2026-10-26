import { useEffect } from 'react';
import type { ChannelRecord } from '@/components/app/types';
import { saveResumePosition } from '@/lib/player/playerStorage';

const SAVE_INTERVAL_MS = 5000;

// Xtream URLs look like /{movie|series|live}/{user}/{pass}/{streamId}.{ext}.
const XTREAM_STREAM_PATH = /\/(movie|series|live)\/[^/]+\/[^/]+\/([^/]+)$/i;

/**
 * Stable resume key for a playable item. Channel ids change whenever a source
 * is refreshed, so the key is derived from the stream itself; for Xtream the
 * credentials are skipped so positions also survive a password change.
 */
export function resumeKeyFor(item: ChannelRecord) {
  const url = item.stream_url.trim();
  const path = url.split(/[?#]/)[0] ?? url;
  const xtream = XTREAM_STREAM_PATH.exec(path);
  const identity = xtream ? `${xtream[1].toLowerCase()}/${xtream[2]}` : url;
  return `${item.media_kind}:${item.source_id}:${identity}`;
}

/** Persists the watch position of on-demand media while it plays. */
export function useResumeTracking(
  video: HTMLVideoElement | null,
  resumeKey: string,
  enabled: boolean
) {
  useEffect(() => {
    if (!video || !enabled) {
      return;
    }

    // Remember the last real position: by the time this effect is cleaned up
    // the stream controller may already have emptied the element.
    let position: number | null = null;
    let duration = Number.NaN;
    let lastSavedAt = 0;

    const observe = () => {
      if (video.readyState > 0) {
        position = video.currentTime;
        duration = video.duration;
      }
    };

    const save = () => {
      if (position === null) {
        return;
      }
      saveResumePosition(resumeKey, position, duration);
      lastSavedAt = Date.now();
    };

    const handleTimeUpdate = () => {
      observe();
      if (Date.now() - lastSavedAt >= SAVE_INTERVAL_MS) {
        save();
      }
    };

    const handlePauseOrEnd = () => {
      observe();
      save();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePauseOrEnd);
    video.addEventListener('ended', handlePauseOrEnd);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePauseOrEnd);
      video.removeEventListener('ended', handlePauseOrEnd);
      save();
    };
  }, [enabled, resumeKey, video]);
}
