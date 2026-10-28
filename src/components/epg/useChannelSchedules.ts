import { useEffect, useMemo, useState } from 'react';
import { listChannelsEpg, refreshChannelEpg } from '@/lib/api/epgApi';
import { guideWindow } from '@/lib/epg/guideWindow';
import { type EpgProgramme, toProgrammes } from '@/lib/epg/schedule';
import { useSourceActivityStore } from '@/store/sourceActivityStore';

const CACHE_TTL_MS = 2 * 60_000;
/** How far ahead every view reads; enough for "next" after a long programme. */
const SCHEDULE_SPAN_SECONDS = 12 * 3600;
/** Channels per backend read; the guide shows a few dozen rows at a time. */
const BATCH_SIZE = 200;
const CLOCK_TICK_MS = 60_000;

/**
 * The stored-schedule window all views share. It starts where the guide's
 * timeline does, so it only moves every half hour and cached rows stay valid.
 */
export function scheduleWindow(nowSeconds: number) {
  const from = guideWindow(nowSeconds).start;
  return { from, to: from + SCHEDULE_SPAN_SECONDS };
}

type CacheEntry = { at: number; from: number; programmes: EpgProgramme[] };

/** Stored (local) schedules; reading them never contacts the provider. */
const cache = new Map<number, CacheEntry>();

// A finished guide refresh changes stored schedules for that source.
useSourceActivityStore.subscribe((state, previous) => {
  if (state.guideUpdatedAt !== previous.guideUpdatedAt) {
    cache.clear();
  }
});

function cached(channelId: number, from: number) {
  const entry = cache.get(channelId);
  return entry && entry.from === from && Date.now() - entry.at < CACHE_TTL_MS ? entry : null;
}

/** One backend read per batch of channels that aren't cached for this window. */
async function loadMissing(channelIds: number[]) {
  const { from, to } = scheduleWindow(Date.now() / 1000);
  const missing = channelIds.filter((id) => !cached(id, from));
  for (let index = 0; index < missing.length; index += BATCH_SIZE) {
    const batch = missing.slice(index, index + BATCH_SIZE);
    const records = await listChannelsEpg(batch, from, to).catch(() => []);
    const entriesById = new Map(records.map((record) => [record.channel_id, record.entries]));
    const at = Date.now();
    for (const id of batch) {
      cache.set(id, { at, from, programmes: toProgrammes(entriesById.get(id) ?? []) });
    }
  }
}

/** Channels already re-fetched from the provider this session. */
const refreshedFromProvider = new Set<number>();

/**
 * When the stored guide for a channel has nothing left to show, ask the
 * provider once (like the player does). Only for channels the user picked.
 */
async function refreshExhausted(channelIds: number[]) {
  const nowSeconds = Date.now() / 1000;
  const stale = channelIds.filter(
    (id) =>
      !refreshedFromProvider.has(id) &&
      !(cache.get(id)?.programmes ?? []).some((programme) => programme.end > nowSeconds)
  );
  if (stale.length === 0) {
    return;
  }
  await Promise.all(
    stale.map(async (id) => {
      refreshedFromProvider.add(id);
      await refreshChannelEpg(id).catch(() => null);
      cache.delete(id);
    })
  );
  await loadMissing(stale);
}

export function clearScheduleCache() {
  cache.clear();
  refreshedFromProvider.clear();
}

/**
 * Stored guide data for several live channels (rows on screen, favourites on
 * Home): every programme from the guide's first slot to 12 hours ahead, read
 * in one batch, cached briefly and dropped whenever a guide refresh finishes.
 */
export function useChannelSchedules(
  channelIds: number[],
  { enabled = true, refreshIfExhausted = false } = {}
) {
  const guideUpdatedAt = useSourceActivityStore((state) => state.guideUpdatedAt);
  const [version, setVersion] = useState(0);
  const { from } = scheduleWindow(useNowSeconds(CLOCK_TICK_MS));
  const key = channelIds.join(',');

  useEffect(() => {
    if (!enabled || key === '') {
      return;
    }
    let cancelled = false;
    const ids = key.split(',').map(Number);
    void loadMissing(ids)
      .then(() => {
        if (!cancelled) setVersion((current) => current + 1);
        return refreshIfExhausted ? refreshExhausted(ids) : undefined;
      })
      .then(() => {
        if (!cancelled && refreshIfExhausted) setVersion((current) => current + 1);
      });
    return () => {
      cancelled = true;
    };
    // `from` reloads the rows when the window moves on to the next half hour.
  }, [enabled, from, guideUpdatedAt, key, refreshIfExhausted]);

  return useMemo(() => {
    const result: Record<number, EpgProgramme[]> = {};
    if (!enabled) return result;
    for (const id of key === '' ? [] : key.split(',').map(Number)) {
      const entry = cache.get(id);
      if (entry) result[id] = entry.programmes;
    }
    return result;
    // `version` and `guideUpdatedAt` re-read the cache after loads and refreshes.
  }, [enabled, key, version, guideUpdatedAt]);
}

/** Current time in unix seconds, ticking every `intervalMs`. */
export function useNowSeconds(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
