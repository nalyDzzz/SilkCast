import { useEffect } from 'react';
import { create } from 'zustand';
import type { ChannelRecord, MediaDetails } from '@/components/app/types';
import { getMediaDetails } from '@/lib/api/mediaDetailsApi';

type DetailsEntry =
  | { status: 'loading' }
  | { status: 'ready'; details: MediaDetails | null; loadedAt: number }
  | { status: 'error'; error: string };

/**
 * How long a loaded entry is reused before asking the backend again (which
 * answers from its own week-long cache, or the provider once that expires).
 */
export const SESSION_DETAILS_TTL_MS = 60 * 60 * 1000;
const refreshing = new Set<number>();

/**
 * Movie and series details by channel id, shared by the details pages and
 * Home. The backend caches them for a week, so this only spares repeat calls
 * within a session.
 */
export const useMediaDetailsStore = create<{ entries: Record<number, DetailsEntry> }>(() => ({
  entries: {},
}));

function setEntry(channelId: number, entry: DetailsEntry) {
  useMediaDetailsStore.setState((state) => ({
    entries: { ...state.entries, [channelId]: entry },
  }));
}

/**
 * Fetches an item's details unless they're loading or recently loaded.
 * Failures retry; older details stay on screen while they're reloaded.
 */
export function loadMediaDetails(channelId: number, now = Date.now()) {
  const current = useMediaDetailsStore.getState().entries[channelId];
  if (current?.status === 'loading') {
    return;
  }
  if (current?.status === 'ready') {
    if (now - current.loadedAt < SESSION_DETAILS_TTL_MS || refreshing.has(channelId)) {
      return;
    }
    refreshing.add(channelId);
    getMediaDetails(channelId)
      .then((details) => setEntry(channelId, { status: 'ready', details, loadedAt: Date.now() }))
      .catch(() => undefined)
      .finally(() => refreshing.delete(channelId));
    return;
  }

  setEntry(channelId, { status: 'loading' });
  getMediaDetails(channelId)
    .then((details) => setEntry(channelId, { status: 'ready', details, loadedAt: Date.now() }))
    .catch((err) => setEntry(channelId, { status: 'error', error: String(err) }));
}

/** A catalog changed: channel ids may now be other titles, so start over. */
export function clearMediaDetails() {
  useMediaDetailsStore.setState({ entries: {} });
}

export function hasProviderDetails(item: ChannelRecord | null): item is ChannelRecord {
  return item !== null && (item.media_kind === 'movie' || item.media_kind === 'series');
}

/**
 * Details for a movie or series, loaded on first use. Pass `enabled: false`
 * to wait (the series page waits for its episode list, which caches them).
 */
export function useMediaDetails(item: ChannelRecord | null, { enabled = true } = {}) {
  const channelId = hasProviderDetails(item) ? item.id : null;
  const entry = useMediaDetailsStore((state) =>
    channelId === null ? undefined : state.entries[channelId]
  );

  // Fetching from the backend is a real side effect of showing the item. It
  // runs again when the entry disappears (a catalog changed under the page).
  const missing = entry === undefined;
  useEffect(() => {
    if (channelId !== null && enabled && missing) {
      loadMediaDetails(channelId);
    }
  }, [channelId, enabled, missing]);

  return {
    details: entry?.status === 'ready' ? (entry.details ?? null) : null,
    loading: channelId !== null && (entry === undefined || entry.status === 'loading'),
    error: entry?.status === 'error' ? entry.error : null,
    retry: () => {
      if (channelId !== null) loadMediaDetails(channelId);
    },
  };
}
