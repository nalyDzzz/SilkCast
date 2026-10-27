import type { ChannelRecord, RecentChannelRecord } from '@/components/app/types';
import { resumeKeyFor } from '@/components/player/hooks/useResumeTracking';
import type { ResumeEntry } from '@/lib/player/playerStorage';

export type ContinueItem = {
  item: ChannelRecord;
  /** 0..1, movies only (series progress is tracked per episode). */
  progress: number | null;
  secondsLeft: number | null;
};

function uniqueById(items: ChannelRecord[]) {
  const seen = new Set<number>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/** Movies and series from watch history, most recent first, with resume progress. */
export function continueItems(
  recents: RecentChannelRecord[],
  sourceId: number | null,
  resume: Readonly<Record<string, ResumeEntry>>,
  limit: number
): ContinueItem[] {
  return uniqueById(
    recents
      .filter((recent) => recent.channel.source_id === sourceId && recent.channel.media_kind !== 'live')
      .map((recent) => recent.channel)
  )
    .slice(0, limit)
    .map((item) => {
      const entry = item.media_kind === 'movie' ? resume[resumeKeyFor(item)] : undefined;
      if (!entry || entry.duration <= 0) {
        return { item, progress: null, secondsLeft: null };
      }
      return {
        item,
        progress: Math.min(entry.position / entry.duration, 1),
        secondsLeft: Math.max(entry.duration - entry.position, 0),
      };
    });
}

/** Favourite channels first, then recently watched ones, without repeats. */
export function onNowChannels(
  favorites: ChannelRecord[],
  recents: RecentChannelRecord[],
  sourceId: number | null,
  limit: number
) {
  const recentLive = recents
    .filter((recent) => recent.channel.source_id === sourceId && recent.channel.media_kind === 'live')
    .map((recent) => recent.channel);
  return uniqueById([...favorites, ...recentLive]).slice(0, limit);
}

/** "31 min left", "1 h 44 min left". */
export function formatSecondsLeft(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h left` : `${hours} h ${rest} min left`;
}
