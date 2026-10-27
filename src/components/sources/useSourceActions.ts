import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { BackendEvent, SourceRecord } from '@/components/app/types';
import { useBackendEvents } from '@/hooks/useBackendEvents';
import { useAppStore } from '@/store/appStore';
import { formatAgo, useSourceActivityStore } from '@/store/sourceActivityStore';

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
  const { refreshingSourceId, refreshingGuideSourceId, guideUpdatedAt } =
    useSourceActivityStore(
      useShallow((state) => ({
        refreshingSourceId: state.refreshingSourceId,
        refreshingGuideSourceId: state.refreshingGuideSourceId,
        guideUpdatedAt: state.guideUpdatedAt,
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
  const supportsGuide = selectedSource?.source_type === 'xtream';
  const isRefreshingSource = refreshingSourceId !== null;
  const isRefreshingGuide = refreshingGuideSourceId !== null;

  const guideStatus = !supportsGuide
    ? null
    : isRefreshingGuide
      ? 'Updating guide…'
      : selectedSourceId !== null && guideUpdatedAt[selectedSourceId]
        ? `Guide updated ${formatAgo(guideUpdatedAt[selectedSourceId])}`
        : 'Guide not refreshed yet';

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
    isRefreshingSource,
    isRefreshingGuide,
    refreshSource,
    refreshGuide,
    switchSource,
    openSourceManager,
  };
}

/** Records when a guide refresh finishes. Mount once, in the app layout. */
export function useGuideRefreshEvents() {
  useBackendEvents(
    (event: BackendEvent) => {
      if (event.event !== 'epg_updated') {
        return;
      }
      const sourceId = event.payload['source_id'];
      if (typeof sourceId === 'number') {
        useSourceActivityStore.getState().markGuideUpdated(sourceId);
      }
    },
    () => useSourceActivityStore.getState().clearGuideRefresh()
  );
}
