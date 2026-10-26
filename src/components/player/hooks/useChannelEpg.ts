import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiveEpgEntryRecord } from '@/components/app/types';
import { listChannelEpg, refreshChannelEpg } from '@/lib/api/epgApi';

const CLOCK_TICK_MS = 30_000;
const EPG_ENTRY_LIMIT = 3;

export type EpgProgramme = {
  title: string;
  description: string | null;
  start: number;
  end: number;
};

export type ChannelEpgNowNext = {
  now: EpgProgramme | null;
  next: EpgProgramme | null;
  /** 0..1 progress through the current programme. */
  progress: number | null;
};

function toProgramme(entry: LiveEpgEntryRecord): EpgProgramme | null {
  if (entry.start_timestamp === null || entry.end_timestamp === null) {
    return null;
  }

  return {
    title: entry.title,
    description: entry.description,
    start: entry.start_timestamp,
    end: entry.end_timestamp,
  };
}

export function selectNowNext(
  entries: LiveEpgEntryRecord[],
  nowSeconds: number
): ChannelEpgNowNext {
  const programmes = entries
    .map(toProgramme)
    .filter((programme): programme is EpgProgramme => programme !== null)
    .sort((a, b) => a.start - b.start);

  const now =
    programmes.find(
      (programme) => programme.start <= nowSeconds && programme.end > nowSeconds
    ) ?? null;
  const next =
    programmes.find(
      (programme) => programme.start >= (now?.end ?? nowSeconds)
    ) ?? null;
  const progress =
    now && now.end > now.start
      ? Math.min(
          Math.max((nowSeconds - now.start) / (now.end - now.start), 0),
          1
        )
      : null;

  return { now, next, progress };
}

function hasUpcomingProgramme(
  entries: LiveEpgEntryRecord[],
  nowSeconds: number
) {
  return entries.some(
    (entry) => entry.end_timestamp !== null && entry.end_timestamp > nowSeconds
  );
}

/** Now/next programme info for a live channel, refreshed as programmes end. */
export function useChannelEpg(channelId: number | null, enabled: boolean) {
  const [result, setResult] = useState<{
    channelId: number | null;
    entries: LiveEpgEntryRecord[];
  }>({ channelId: null, entries: [] });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshToken, setRefreshToken] = useState(0);
  const resultRef = useRef(result);
  resultRef.current = result;

  useEffect(() => {
    if (!enabled || channelId === null) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      const nowSeconds = Date.now() / 1000;
      let entries = await listChannelEpg(channelId, EPG_ENTRY_LIMIT).catch(
        () => [] as LiveEpgEntryRecord[]
      );

      if (!hasUpcomingProgramme(entries, nowSeconds)) {
        entries = await refreshChannelEpg(channelId, EPG_ENTRY_LIMIT).catch(
          () => entries
        );
      }

      if (!cancelled) {
        // An exhausted guide is stored as empty so the clock doesn't refetch it
        // every tick.
        setResult({
          channelId,
          entries: hasUpcomingProgramme(entries, Date.now() / 1000)
            ? entries
            : [],
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [channelId, enabled, refreshToken]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);

      const { entries } = resultRef.current;
      if (entries.length > 0 && !hasUpcomingProgramme(entries, now / 1000)) {
        setRefreshToken((token) => token + 1);
      }
    }, CLOCK_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled]);

  return useMemo<ChannelEpgNowNext>(() => {
    if (!enabled || result.channelId !== channelId) {
      return { now: null, next: null, progress: null };
    }

    return selectNowNext(result.entries, nowMs / 1000);
  }, [channelId, enabled, nowMs, result]);
}
