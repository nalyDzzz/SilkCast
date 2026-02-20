import { useEffect, useRef } from 'react';
import '../App.css';
import { ChannelsPane } from '../components/app/ChannelsPane';
import { PlayerPane } from '../components/app/PlayerPane';
import { SidebarPane } from '../components/app/SidebarPane';
import {
  ALL_GROUPS,
  BackendEvent,
  PlaybackStatus,
} from '../components/app/types';
import { subscribeBackendEvents } from '../lib/api/eventsApi';
import * as playbackApi from '../lib/api/playbackApi';
import { useAppStore } from '../store/appStore';
import { useShallow } from 'zustand/react/shallow';

export function DashboardPage() {
  const embeddedSurfaceRef = useRef<HTMLDivElement | null>(null);
  const embeddedSurfaceStartedRef = useRef(false);
  const lastVolumeBeforeMuteRef = useRef(100);

  const {
    selectedSourceId,
    selectedGroup,
    searchQuery,
    favoritesOnly,
    playback,
    setPlayback,
    setError,
    clearSourceLists,
    setSelectedGroup,
    loadSources,
    loadGroups,
    loadChannels,
    loadRecents,
    loadPlaybackStatus,
    loadSettings,
    refreshEverything,
    saveFullscreenState,
    pausePlayback,
    setVolume,
    seekPlayback,
  } = useAppStore(
    useShallow((state) => ({
      selectedSourceId: state.selectedSourceId,
      selectedGroup: state.selectedGroup,
      searchQuery: state.searchQuery,
      favoritesOnly: state.favoritesOnly,
      playback: state.playback,
      setPlayback: state.setPlayback,
      setError: state.setError,
      clearSourceLists: state.clearSourceLists,
      setSelectedGroup: state.setSelectedGroup,
      loadSources: state.loadSources,
      loadGroups: state.loadGroups,
      loadChannels: state.loadChannels,
      loadRecents: state.loadRecents,
      loadPlaybackStatus: state.loadPlaybackStatus,
      loadSettings: state.loadSettings,
      refreshEverything: state.refreshEverything,
      saveFullscreenState: state.saveFullscreenState,
      pausePlayback: state.pausePlayback,
      setVolume: state.setVolume,
      seekPlayback: state.seekPlayback,
    }))
  );

  useEffect(() => {
    if (playback && playback.volume > 0) {
      lastVolumeBeforeMuteRef.current = playback.volume;
    }
  }, [playback]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void refreshEverything();

    subscribeBackendEvents((backendEvent: BackendEvent) => {
      if (backendEvent.event === 'playback_state_changed') {
        const playbackState = backendEvent.payload['state'] as
          | PlaybackStatus
          | undefined;
        if (playbackState) {
          setPlayback(playbackState);
        }
        return;
      }

      if (backendEvent.event === 'sources_updated') {
        void loadSources().catch((err) => setError(String(err)));
        return;
      }

      if (backendEvent.event === 'settings_updated') {
        void loadSettings().catch((err) => setError(String(err)));
        return;
      }

      if (backendEvent.event === 'recents_updated') {
        void loadRecents().catch((err) => setError(String(err)));
      }
    })
      .then((unsubscribe) => {
        unlisten = unsubscribe;
      })
      .catch((err) => setError(String(err)));

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [
    loadRecents,
    loadSettings,
    loadSources,
    refreshEverything,
    setError,
    setPlayback,
  ]);

  useEffect(() => {
    if (selectedSourceId === null) {
      clearSourceLists();
      return;
    }

    setSelectedGroup(ALL_GROUPS);
    setError(null);
    void loadGroups(selectedSourceId).catch((err) => setError(String(err)));
  }, [
    clearSourceLists,
    loadGroups,
    selectedSourceId,
    setError,
    setSelectedGroup,
  ]);

  useEffect(() => {
    if (selectedSourceId === null) {
      clearSourceLists();
      return;
    }

    setError(null);
    void loadChannels(selectedSourceId).catch((err) => setError(String(err)));
  }, [
    clearSourceLists,
    favoritesOnly,
    loadChannels,
    searchQuery,
    selectedGroup,
    selectedSourceId,
    setError,
  ]);

  async function ensureEmbeddedSurfaceRunning() {
    const host = embeddedSurfaceRef.current;
    if (!host) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    if (!embeddedSurfaceStartedRef.current) {
      await playbackApi.startEmbeddedSurfaceMode(bounds);
      embeddedSurfaceStartedRef.current = true;
      await loadPlaybackStatus();
      return;
    }

    try {
      await playbackApi.updateEmbeddedSurfaceBounds(bounds);
    } catch (err) {
      const message = String(err);
      const likelyMissingSurface =
        message.includes('embedded surface mode is not active') ||
        message.includes('failed to move embedded playback surface');
      if (!likelyMissingSurface) {
        throw err;
      }

      embeddedSurfaceStartedRef.current = false;
      await playbackApi.startEmbeddedSurfaceMode(bounds);
      embeddedSurfaceStartedRef.current = true;
      await loadPlaybackStatus();
    }
  }

  useEffect(() => {
    let mounted = true;
    let rafId: number | null = null;

    const scheduleSurfaceSync = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(async () => {
        rafId = null;
        if (!mounted) {
          return;
        }
        try {
          await ensureEmbeddedSurfaceRunning();
        } catch (err) {
          setError(String(err));
        }
      });
    };

    const observer = new ResizeObserver(() => scheduleSurfaceSync());
    if (embeddedSurfaceRef.current) {
      observer.observe(embeddedSurfaceRef.current);
    }

    scheduleSurfaceSync();
    window.addEventListener('resize', scheduleSurfaceSync);
    window.addEventListener('scroll', scheduleSurfaceSync, true);

    return () => {
      mounted = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener('resize', scheduleSurfaceSync);
      window.removeEventListener('scroll', scheduleSurfaceSync, true);
    };
  }, [setError]);

  async function onSetFullscreen(fullscreen: boolean) {
    setError(null);
    try {
      const host = embeddedSurfaceRef.current;
      if (!host) {
        throw new Error('embedded player surface not available');
      }

      if (fullscreen) {
        if (document.fullscreenElement !== host) {
          await host.requestFullscreen();
        }
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }

      await saveFullscreenState(fullscreen);
      await ensureEmbeddedSurfaceRunning();
      await loadPlaybackStatus();
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      saveFullscreenState(isFullscreen)
        .then(() => ensureEmbeddedSurfaceRunning())
        .then(() => loadPlaybackStatus())
        .catch((err) => setError(String(err)));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [loadPlaybackStatus, saveFullscreenState, setError]);

  useEffect(() => {
    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      const tagName = target.tagName.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        tagName === 'button'
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (isInteractiveTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasCurrentPlayback = Boolean(playback?.current_url);

      if (event.code === 'Space' || key === 'spacebar') {
        if (!hasCurrentPlayback) {
          return;
        }
        event.preventDefault();
        const isPaused = playback?.state.toLowerCase() === 'paused';
        void pausePlayback(!isPaused);
        return;
      }

      if (key === 'f') {
        event.preventDefault();
        void onSetFullscreen(!Boolean(playback?.fullscreen));
        return;
      }

      if (key === 'm') {
        if (!hasCurrentPlayback) {
          return;
        }
        event.preventDefault();
        const currentVolume = playback?.volume ?? 100;
        const nextVolume =
          currentVolume > 0
            ? 0
            : Math.max(1, Math.min(100, lastVolumeBeforeMuteRef.current));
        void setVolume(nextVolume);
        return;
      }

      if (key === 'arrowleft') {
        if (!hasCurrentPlayback) {
          return;
        }
        event.preventDefault();
        void seekPlayback(-10);
        return;
      }

      if (key === 'arrowright') {
        if (!hasCurrentPlayback) {
          return;
        }
        event.preventDefault();
        void seekPlayback(10);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pausePlayback, playback, seekPlayback, setVolume]);

  return (
    <main className="phase1-layout">
      <SidebarPane />
      <ChannelsPane />
      <PlayerPane
        embeddedSurfaceRef={embeddedSurfaceRef}
        onSetFullscreen={onSetFullscreen}
      />
    </main>
  );
}

(DashboardPage as any).whyDidYouRender = true;
