import { create } from 'zustand';
import { refreshSourceEpg } from '@/lib/api/epgApi';

const GUIDE_UPDATED_KEY = 'silkcast:guideUpdatedAt';

function readGuideUpdatedAt(): Record<number, number> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(GUIDE_UPDATED_KEY) ?? '{}'
    );
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<number, number>)
      : {};
  } catch {
    return {};
  }
}

type SourceActivityState = {
  /** Source whose catalog is being re-imported, if any. */
  refreshingSourceId: number | null;
  /** Source whose guide (EPG) is being refreshed in the background, if any. */
  refreshingGuideSourceId: number | null;
  /** When each source's guide last finished refreshing (ms since epoch). */
  guideUpdatedAt: Record<number, number>;
  setRefreshingSource: (sourceId: number | null) => void;
  startGuideRefresh: (sourceId: number) => Promise<void>;
  markGuideUpdated: (sourceId: number) => void;
  clearGuideRefresh: () => void;
};

/** App-wide refresh state, shared by the source switcher, palette and Live TV. */
export const useSourceActivityStore = create<SourceActivityState>((set, get) => ({
  refreshingSourceId: null,
  refreshingGuideSourceId: null,
  guideUpdatedAt: readGuideUpdatedAt(),
  setRefreshingSource: (sourceId) => set({ refreshingSourceId: sourceId }),
  startGuideRefresh: async (sourceId) => {
    if (get().refreshingGuideSourceId !== null) {
      return;
    }
    set({ refreshingGuideSourceId: sourceId });
    try {
      // Returns once queued; completion arrives as an `epg_updated` event.
      await refreshSourceEpg(sourceId);
    } catch (error) {
      set({ refreshingGuideSourceId: null });
      throw error;
    }
  },
  markGuideUpdated: (sourceId) => {
    const guideUpdatedAt = { ...get().guideUpdatedAt, [sourceId]: Date.now() };
    try {
      window.localStorage.setItem(GUIDE_UPDATED_KEY, JSON.stringify(guideUpdatedAt));
    } catch {
      // Display-only; losing it just shows "not refreshed yet".
    }
    set((state) => ({
      guideUpdatedAt,
      refreshingGuideSourceId:
        state.refreshingGuideSourceId === sourceId ? null : state.refreshingGuideSourceId,
    }));
  },
  clearGuideRefresh: () => set({ refreshingGuideSourceId: null }),
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
