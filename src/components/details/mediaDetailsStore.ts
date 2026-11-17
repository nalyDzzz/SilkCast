import { useEffect } from 'react';
import { create } from 'zustand';
import type { ChannelRecord, MediaDetails } from '@/components/app/types';
import { getMediaDetails } from '@/lib/api/mediaDetailsApi';

type DetailsEntry =
  | { status: 'loading' }
  | { status: 'ready'; details: MediaDetails | null }
  | { status: 'error'; error: string };

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

/** Fetches an item's details unless they're loaded or loading. Failures retry. */
export function loadMediaDetails(channelId: number) {
  const current = useMediaDetailsStore.getState().entries[channelId];
  if (current && current.status !== 'error') {
    return;
  }

  setEntry(channelId, { status: 'loading' });
  getMediaDetails(channelId)
    .then((details) => setEntry(channelId, { status: 'ready', details }))
    .catch((err) => setEntry(channelId, { status: 'error', error: String(err) }));
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

  // Fetching from the backend is a real side effect of showing the item.
  useEffect(() => {
    if (channelId !== null && enabled) {
      loadMediaDetails(channelId);
    }
  }, [channelId, enabled]);

  return {
    details: entry?.status === 'ready' ? (entry.details ?? null) : null,
    loading: channelId !== null && (entry === undefined || entry.status === 'loading'),
    error: entry?.status === 'error' ? entry.error : null,
    retry: () => {
      if (channelId !== null) loadMediaDetails(channelId);
    },
  };
}
