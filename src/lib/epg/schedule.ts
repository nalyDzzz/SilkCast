import type { LiveEpgEntryRecord } from '@/components/app/types';
import type { EpgProgramme } from '@/components/player/hooks/useChannelEpg';

export type { EpgProgramme };

/** Programmes with usable times, oldest first. Times are unix seconds. */
export function toProgrammes(entries: LiveEpgEntryRecord[]): EpgProgramme[] {
  return entries
    .filter(
      (entry): entry is LiveEpgEntryRecord & { start_timestamp: number; end_timestamp: number } =>
        entry.start_timestamp !== null &&
        entry.end_timestamp !== null &&
        entry.end_timestamp > entry.start_timestamp
    )
    .map((entry) => ({
      title: entry.title,
      description: entry.description,
      start: entry.start_timestamp,
      end: entry.end_timestamp,
    }))
    .sort((a, b) => a.start - b.start);
}

export type ScheduleSlots = {
  now: EpgProgramme | null;
  next: EpgProgramme | null;
  later: EpgProgramme | null;
};

export function scheduleSlots(programmes: EpgProgramme[], nowSeconds: number): ScheduleSlots {
  const nowIndex = programmes.findIndex((p) => p.start <= nowSeconds && p.end > nowSeconds);
  const upcoming = programmes.filter((p) => p.start >= nowSeconds);
  if (nowIndex === -1) {
    return { now: null, next: upcoming[0] ?? null, later: upcoming[1] ?? null };
  }
  return {
    now: programmes[nowIndex],
    next: programmes[nowIndex + 1] ?? null,
    later: programmes[nowIndex + 2] ?? null,
  };
}

/** 0..1 through a programme. */
export function programmeProgress(programme: EpgProgramme, nowSeconds: number) {
  if (programme.end <= programme.start) return 0;
  return Math.min(Math.max((nowSeconds - programme.start) / (programme.end - programme.start), 0), 1);
}

/** "18 min left", "1 h 43 min left". */
export function formatTimeLeft(endSeconds: number, nowSeconds: number) {
  const minutes = Math.max(0, Math.round((endSeconds - nowSeconds) / 60));
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h left` : `${hours} h ${rest} min left`;
}

/** "Starts in 18 min" or "Starts at 20:00" for later programmes. */
export function formatStartsIn(startSeconds: number, nowSeconds: number, clock: (s: number) => string) {
  const minutes = Math.round((startSeconds - nowSeconds) / 60);
  return minutes <= 90 ? `Starts in ${Math.max(minutes, 1)} min` : `Starts at ${clock(startSeconds)}`;
}
