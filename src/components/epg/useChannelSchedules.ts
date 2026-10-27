import { useEffect, useMemo, useState } from 'react';
import { listChannelEpg, refreshChannelEpg } from '@/lib/api/epgApi';
import { type EpgProgramme, toProgrammes } from '@/lib/epg/schedule';
import { useSourceActivityStore } from '@/store/sourceActivityStore';

const CACHE_TTL_MS = 2 * 60_000;
const MAX_PARALLEL = 6;

type CacheEntry = { at: number; limit: number; programmes: EpgProgramme[] };

/** Stored (local) schedules; reading them never contacts the provider. */
const cache = new Map<number, CacheEntry>();

// A finished guide refresh changes stored schedules for that source.
useSourceActivityStore.subscribe((state, previous) => {
  if (state.guideUpdatedAt !== previous.guideUpdatedAt) {
    cache.clear();
  }
});

function cached(channelId: number, limit: number) {
  const entry = cache.get(channelId);
  return entry && entry.limit >= limit && Date.now() - entry.at < CACHE_TTL_MS ? entry : null;
}

async function loadMissing(channelIds: number[], limit: number) {
  const queue = channelIds.filter((id) => !cached(id, limit));
  const workers = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const entries = await listChannelEpg(id, limit).catch(() => []);
      cache.set(id, { at: Date.now(), limit, programmes: toProgrammes(entries) });
    }
  });
  await Promise.all(workers);
}

/** Channels already re-fetched from the provider this session. */
const refreshedFromProvider = new Set<number>();

/**
 * When the stored guide for a channel has nothing left to show, ask the
 * provider once (like the player does). Only for channels the user picked.
 */
async function refreshExhausted(channelIds: number[], limit: number) {
  const nowSeconds = Date.now() / 1000;
  const stale = channelIds.filter(
    (id) =>
      !refreshedFromProvider.has(id) &&
      !(cache.get(id)?.programmes ?? []).some((programme) => programme.end > nowSeconds)
  );
  await Promise.all(
    stale.map(async (id) => {
      refreshedFromProvider.add(id);
      const entries = await refreshChannelEpg(id, limit).catch(() => null);
      if (entries) {
        cache.set(id, { at: Date.now(), limit, programmes: toProgrammes(entries) });
      }
    })
  );
}

export function clearScheduleCache() {
  cache.clear();
  refreshedFromProvider.clear();
}

/**
 * Stored guide data for several live channels (rows on screen, favourites on
 * Home). Cached briefly and dropped whenever a guide refresh finishes.
 */
export function useChannelSchedules(
  channelIds: number[],
  { limit = 4, enabled = true, refreshIfExhausted = false } = {}
) {
  const guideUpdatedAt = useSourceActivityStore((state) => state.guideUpdatedAt);
  const [version, setVersion] = useState(0);
  const key = channelIds.join(',');

  useEffect(() => {
    if (!enabled || key === '') {
      return;
    }
    let cancelled = false;
    const ids = key.split(',').map(Number);
    void loadMissing(ids, limit)
      .then(() => {
        if (!cancelled) setVersion((current) => current + 1);
        return refreshIfExhausted ? refreshExhausted(ids, limit) : undefined;
      })
      .then(() => {
        if (!cancelled && refreshIfExhausted) setVersion((current) => current + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, guideUpdatedAt, key, limit, refreshIfExhausted]);

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
