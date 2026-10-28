import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { BackendEvent, GuideProgress, SourceRecord } from '@/components/app/types';
import { useBackendEvents } from '@/hooks/useBackendEvents';
import { useAppStore } from '@/store/appStore';
import {
  formatAgo,
  formatGuideProgress,
  guideRefreshDue,
  useSourceActivityStore,
} from '@/store/sourceActivityStore';

export function sourceKindLabel(source: SourceRecord) {
  return source.source_type === 'xtream' ? 'Xtream provider' : 'M3U playlist';
}

function mediaKindForPath(pathname: string) {
  if (pathname.startsWith('/dashboard/movies')) return 'movie' as const;
  if (pathname.startsWith('/dashboard/series')) return 'series' as const;
  return 'live' as const;
}

/** Source switching and refresh actions, shared by the top bar and the palette. */
export function useSourceActions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sources, selectedSourceId, setSelectedSourceId, manageSources } = useAppStore(
    useShallow((state) => ({
      sources: state.sources,
      selectedSourceId: state.selectedSourceId,
      setSelectedSourceId: state.setSelectedSourceId,
      manageSources: state.manageSources,
    }))
  );
  const { refreshingSourceId, refreshingGuideSourceId, guideProgress, guideUpdatedAt, guideErrors } =
    useSourceActivityStore(
      useShallow((state) => ({
        refreshingSourceId: state.refreshingSourceId,
        refreshingGuideSourceId: state.refreshingGuideSourceId,
        guideProgress: state.guideProgress,
        guideUpdatedAt: state.guideUpdatedAt,
        guideErrors: state.guideErrors,
      }))
    );

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );
  const otherSources = useMemo(
    () => sources.filter((source) => source.id !== selectedSourceId),
    [selectedSourceId, sources]
  );
  const supportsGuide = selectedSource?.supports_guide ?? false;
  const isRefreshingSource = refreshingSourceId !== null;
  const isRefreshingGuide = refreshingGuideSourceId !== null;
  const guideUpdated = selectedSourceId !== null ? guideUpdatedAt[selectedSourceId] : undefined;
  const guideError = selectedSourceId !== null ? guideErrors[selectedSourceId] : undefined;

  const guideStatus = !supportsGuide
    ? null
    : isRefreshingGuide
      ? formatGuideProgress(
          guideProgress?.source_id === refreshingGuideSourceId ? guideProgress : null
        )
      : guideError
        ? 'Guide update failed'
        : guideUpdated
          ? `Guide updated ${formatAgo(guideUpdated)}`
          : 'Guide not loaded yet';

  const refreshSource = useCallback(async () => {
    if (selectedSourceId === null || isRefreshingSource) {
      return;
    }
    const activity = useSourceActivityStore.getState();
    activity.setRefreshingSource(selectedSourceId);
    try {
      await useAppStore
        .getState()
        .refreshSource(selectedSourceId, mediaKindForPath(location.pathname));
      const { error, importMessage } = useAppStore.getState();
      if (error) {
        toast.error("Couldn't refresh the source", { description: error });
      } else {
        toast.success(importMessage ?? 'Source refreshed');
      }
    } finally {
      activity.setRefreshingSource(null);
    }
  }, [isRefreshingSource, location.pathname, selectedSourceId]);

  const refreshGuide = useCallback(async () => {
    if (selectedSourceId === null || !supportsGuide || isRefreshingGuide) {
      return;
    }
    try {
      await useSourceActivityStore.getState().startGuideRefresh(selectedSourceId);
      toast('Updating the guide in the background');
    } catch (error) {
      toast.error("Couldn't update the guide", { description: String(error) });
    }
  }, [isRefreshingGuide, selectedSourceId, supportsGuide]);

  const switchSource = useCallback(
    (sourceId: number) => {
      setSelectedSourceId(sourceId);
      navigate('/dashboard');
    },
    [navigate, setSelectedSourceId]
  );

  const openSourceManager = useCallback(() => {
    manageSources();
    navigate('/');
  }, [manageSources, navigate]);

  return {
    sources,
    selectedSource,
    otherSources,
    supportsGuide,
    guideStatus,
    guideError,
    isRefreshingSource,
    isRefreshingGuide,
    refreshSource,
    refreshGuide,
    switchSource,
    openSourceManager,
  };
}

/** Tracks guide refresh progress and results. Mount once, in the app layout. */
export function useGuideRefreshEvents() {
  useBackendEvents(
    (event: BackendEvent) => {
      const sourceId = event.payload['source_id'];
      if (typeof sourceId !== 'number') {
        return;
      }
      const activity = useSourceActivityStore.getState();
      if (event.event === 'epg_progress') {
        activity.markGuideProgress(event.payload as unknown as GuideProgress);
        return;
      }
      if (event.event !== 'epg_updated') {
        return;
      }
      const error = event.payload['error'];
      activity.markGuideUpdated(sourceId, typeof error === 'string' ? error : undefined);
      if (typeof error === 'string') {
        toast.error("Couldn't update the guide", { description: error });
      }
    },
    () => useSourceActivityStore.getState().clearGuideRefresh()
  );
}

/** Sources whose guide was refreshed automatically this session. */
const autoRefreshed = new Set<number>();

/**
 * Keeps the selected source's guide fresh: refreshes it in the background
 * when it never loaded, is half a day old, or is about to run out. Once per
 * source per session; failures wait an hour. Mount once, in the app layout.
 */
export function useGuideAutoRefresh() {
  const source = useAppStore(
    (state) => state.sources.find((item) => item.id === state.selectedSourceId) ?? null
  );
  const due = source !== null && guideRefreshDue(source);
  const sourceId = source?.id ?? null;

  useEffect(() => {
    if (!due || sourceId === null || autoRefreshed.has(sourceId)) {
      return;
    }
    autoRefreshed.add(sourceId);
    void useSourceActivityStore
      .getState()
      .startGuideRefresh(sourceId)
      .catch(() => undefined);
  }, [due, sourceId]);
}
