import { create } from 'zustand';
import type { GuideProgress, SourceRecord } from '@/components/app/types';
import { refreshSourceEpg } from '@/lib/api/epgApi';

type SourceActivityState = {
  /** Source whose catalog is being re-imported, if any. */
  refreshingSourceId: number | null;
  /** Source whose guide (EPG) is being refreshed in the background, if any. */
  refreshingGuideSourceId: number | null;
  /** Latest progress of that guide refresh. */
  guideProgress: GuideProgress | null;
  /** When each source's guide last finished refreshing (ms since epoch). */
  guideUpdatedAt: Record<number, number>;
  /** Why each source's last guide refresh failed, while it is the latest attempt. */
  guideErrors: Record<number, string>;
  setRefreshingSource: (sourceId: number | null) => void;
  startGuideRefresh: (sourceId: number) => Promise<void>;
  /** Adopts the guide status the backend reports with the source list. */
  syncGuideStatus: (sources: SourceRecord[]) => void;
  markGuideProgress: (progress: GuideProgress) => void;
  markGuideUpdated: (sourceId: number, error?: string) => void;
  clearGuideRefresh: () => void;
};

function sameRecord<T>(a: Record<number, T>, b: Record<number, T>) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[Number(key)] === b[Number(key)])
  );
}

/** App-wide refresh state, shared by the source switcher, palette and Live TV. */
export const useSourceActivityStore = create<SourceActivityState>((set, get) => ({
  refreshingSourceId: null,
  refreshingGuideSourceId: null,
  guideProgress: null,
  guideUpdatedAt: {},
  guideErrors: {},
  setRefreshingSource: (sourceId) => set({ refreshingSourceId: sourceId }),
  startGuideRefresh: async (sourceId) => {
    if (get().refreshingGuideSourceId !== null) {
      return;
    }
    set({ refreshingGuideSourceId: sourceId, guideProgress: null });
    try {
      // Returns once started (or already running); the result arrives as an
      // `epg_updated` event.
      await refreshSourceEpg(sourceId);
    } catch (error) {
      set({ refreshingGuideSourceId: null });
      throw error;
    }
  },
  syncGuideStatus: (sources) => {
    const guideUpdatedAt: Record<number, number> = {};
    const guideErrors: Record<number, string> = {};
    for (const source of sources) {
      if (source.guide_refreshed_at !== null) {
        guideUpdatedAt[source.id] = source.guide_refreshed_at * 1000;
      }
      if (source.guide_error !== null) {
        guideErrors[source.id] = source.guide_error;
      }
    }
    // Keep identities when nothing changed: a new `guideUpdatedAt` drops the
    // cached schedules.
    const current = get();
    set({
      guideUpdatedAt: sameRecord(current.guideUpdatedAt, guideUpdatedAt)
        ? current.guideUpdatedAt
        : guideUpdatedAt,
      guideErrors: sameRecord(current.guideErrors, guideErrors) ? current.guideErrors : guideErrors,
    });
  },
  markGuideProgress: (progress) =>
    set((state) => ({
      // A refresh started elsewhere (auto refresh, before a reload) still shows.
      refreshingGuideSourceId: state.refreshingGuideSourceId ?? progress.source_id,
      guideProgress: progress,
    })),
  markGuideUpdated: (sourceId, error) =>
    set((state) => {
      const { [sourceId]: _previous, ...otherErrors } = state.guideErrors;
      const finished = {
        refreshingGuideSourceId:
          state.refreshingGuideSourceId === sourceId ? null : state.refreshingGuideSourceId,
        guideProgress: state.guideProgress?.source_id === sourceId ? null : state.guideProgress,
      };
      return error
        ? { ...finished, guideErrors: { ...state.guideErrors, [sourceId]: error } }
        : {
            ...finished,
            guideErrors: otherErrors,
            guideUpdatedAt: { ...state.guideUpdatedAt, [sourceId]: Date.now() },
          };
    }),
  clearGuideRefresh: () => set({ refreshingGuideSourceId: null, guideProgress: null }),
}));

/** "12 min ago", "3 h ago", "yesterday"; null when never. */
export function formatAgo(timestamp: number | undefined, now = Date.now()) {
  if (!timestamp) {
    return null;
  }
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "Updating guide… 42%", "… 1,240 / 15,152 channels", "Saving guide…". */
export function formatGuideProgress(progress: GuideProgress | null) {
  if (!progress) {
    return 'Updating guide…';
  }
  if (progress.phase === 'saving') {
    return 'Saving guide…';
  }
  if (progress.phase === 'fetching' && progress.channels_total > 0) {
    const done = progress.channels_done.toLocaleString();
    return `Updating guide… ${done} / ${progress.channels_total.toLocaleString()} channels`;
  }
  if (progress.total_bytes) {
    const percent = Math.min(99, Math.floor((progress.bytes / progress.total_bytes) * 100));
    return `Updating guide… ${percent}%`;
  }
  return `Updating guide… ${(progress.bytes / 1_048_576).toFixed(1)} MB`;
}

/** A source's guide is due when it never loaded, is 12 h old, or runs out within 6 h. */
const GUIDE_MAX_AGE_SECONDS = 12 * 3600;
const GUIDE_MIN_AHEAD_SECONDS = 6 * 3600;
/** After a failed attempt, wait this long before trying on its own again. */
const GUIDE_RETRY_AFTER_SECONDS = 3600;

export function guideRefreshDue(source: SourceRecord, nowSeconds = Date.now() / 1000) {
  if (!source.supports_guide) {
    return false;
  }
  if (
    source.guide_error !== null &&
    source.guide_attempted_at !== null &&
    nowSeconds - source.guide_attempted_at < GUIDE_RETRY_AFTER_SECONDS
  ) {
    return false;
  }
  return (
    source.guide_refreshed_at === null ||
    nowSeconds - source.guide_refreshed_at > GUIDE_MAX_AGE_SECONDS ||
    (source.guide_covered_until ?? 0) - nowSeconds < GUIDE_MIN_AHEAD_SECONDS
  );
}
