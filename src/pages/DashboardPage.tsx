import { useEffect } from "react";
import { useNavigate } from "react-router";
import { ChannelsPane } from "../components/app/ChannelsPane";
import { PlayerPane } from "../components/app/PlayerPane";
import { SidebarPane } from "../components/app/SidebarPane";
import {
  ALL_GROUPS,
  BackendEvent,
  PlaybackStatus,
} from "../components/app/types";
import { subscribeBackendEvents } from "../lib/api/eventsApi";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";

export function DashboardPage() {
  const navigate = useNavigate();

  const {
    selectedSourceId,
    selectedGroup,
    searchQuery,
    favoritesOnly,
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
  } = useAppStore(
    useShallow((state) => ({
      selectedSourceId: state.selectedSourceId,
      selectedGroup: state.selectedGroup,
      searchQuery: state.searchQuery,
      favoritesOnly: state.favoritesOnly,
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
    }))
  );

  useEffect(() => {
    if (selectedSourceId === null) {
      navigate("/", { replace: true });
    }
  }, [navigate, selectedSourceId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void refreshEverything();

    subscribeBackendEvents((backendEvent: BackendEvent) => {
      if (backendEvent.event === "playback_state_changed") {
        const playbackState = backendEvent.payload["state"] as
          | PlaybackStatus
          | undefined;
        if (playbackState) {
          setPlayback(playbackState);
        }
        return;
      }

      if (backendEvent.event === "sources_updated") {
        void loadSources().catch((err) => setError(String(err)));
        return;
      }

      if (backendEvent.event === "settings_updated") {
        void loadSettings().catch((err) => setError(String(err)));
        return;
      }

      if (backendEvent.event === "recents_updated") {
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
    void loadGroups(selectedSourceId, "live").catch((err) => setError(String(err)));
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
    void loadChannels(selectedSourceId, "live").catch((err) =>
      setError(String(err))
    );
  }, [
    clearSourceLists,
    favoritesOnly,
    loadChannels,
    searchQuery,
    selectedGroup,
    selectedSourceId,
    setError,
  ]);

  useEffect(() => {
    void loadPlaybackStatus().catch((err) => setError(String(err)));
  }, [loadPlaybackStatus, setError]);

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[25%_1fr_25%] xl:grid-cols-[20%_1fr_20%]">
      <SidebarPane />
      <ChannelsPane />
      <PlayerPane />
    </main>
  );
}

(DashboardPage as any).whyDidYouRender = true;
