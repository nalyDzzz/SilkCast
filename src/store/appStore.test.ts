import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useAppStore } from "./appStore";
import { ALL_GROUPS, DEFAULT_SETTINGS } from "../components/app/types";

// Mock all API modules
vi.mock("../lib/api/channelsApi", () => ({
  listSourceChannels: vi.fn(),
  setChannelFavoriteState: vi.fn(),
}));

vi.mock("../lib/api/sourcesApi", () => ({
  listRegisteredSources: vi.fn(),
  listSourceGroups: vi.fn(),
  addM3uSource: vi.fn(),
  refreshM3uSource: vi.fn(),
  deleteRegisteredSource: vi.fn(),
}));

vi.mock("../lib/api/playbackApi", () => ({
  getPlaybackState: vi.fn(),
  openExternalWindow: vi.fn(),
  recordRecentChannelPlay: vi.fn(),
  pausePlayback: vi.fn(),
  stopPlayback: vi.fn(),
  setFullscreen: vi.fn(),
  setVolume: vi.fn(),
  seekPlayback: vi.fn(),
}));

vi.mock("../lib/api/recentsApi", () => ({
  listRecentlyPlayed: vi.fn(),
}));

vi.mock("../lib/api/settingsApi", () => ({
  getPhase1Settings: vi.fn(),
  setPhase1Settings: vi.fn(),
}));

// Lazy imports so mocks are applied first
const getSourcesApi = () =>
  import("../lib/api/sourcesApi") as unknown as Promise<{
    listRegisteredSources: Mock;
    listSourceGroups: Mock;
    addM3uSource: Mock;
    refreshM3uSource: Mock;
    deleteRegisteredSource: Mock;
  }>;

const getPlaybackApi = () =>
  import("../lib/api/playbackApi") as unknown as Promise<{
    getPlaybackState: Mock;
    openExternalWindow: Mock;
    recordRecentChannelPlay: Mock;
    pausePlayback: Mock;
    stopPlayback: Mock;
    setFullscreen: Mock;
    setVolume: Mock;
    seekPlayback: Mock;
  }>;

const getRecentsApi = () =>
  import("../lib/api/recentsApi") as unknown as Promise<{
    listRecentlyPlayed: Mock;
  }>;

const getSettingsApi = () =>
  import("../lib/api/settingsApi") as unknown as Promise<{
    getPhase1Settings: Mock;
    setPhase1Settings: Mock;
  }>;

const getChannelsApi = () =>
  import("../lib/api/channelsApi") as unknown as Promise<{
    listSourceChannels: Mock;
    setChannelFavoriteState: Mock;
  }>;

function resetStore() {
  useAppStore.setState({
    sources: [],
    selectedSourceId: null,
    hasPersistedSourceSelection: false,
    groups: [],
    selectedGroup: ALL_GROUPS,
    channels: [],
    recentChannels: [],
    activeChannel: null,
    playback: null,
    settings: DEFAULT_SETTINGS,
    m3uName: "",
    m3uLocation: "",
    searchQuery: "",
    favoritesOnly: false,
    error: null,
    loading: false,
    importMessage: null,
  });
}

describe("appStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = useAppStore.getState();
      expect(state.sources).toEqual([]);
      expect(state.selectedSourceId).toBeNull();
      expect(state.groups).toEqual([]);
      expect(state.selectedGroup).toBe(ALL_GROUPS);
      expect(state.channels).toEqual([]);
      expect(state.recentChannels).toEqual([]);
      expect(state.activeChannel).toBeNull();
      expect(state.playback).toBeNull();
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
      expect(state.searchQuery).toBe("");
      expect(state.favoritesOnly).toBe(false);
      expect(state.error).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.importMessage).toBeNull();
    });
  });

  describe("simple setters", () => {
    it("setM3uName updates m3uName", () => {
      useAppStore.getState().setM3uName("My Playlist");
      expect(useAppStore.getState().m3uName).toBe("My Playlist");
    });

    it("setM3uLocation updates m3uLocation", () => {
      useAppStore.getState().setM3uLocation("https://example.com/list.m3u");
      expect(useAppStore.getState().m3uLocation).toBe(
        "https://example.com/list.m3u"
      );
    });

    it("setSearchQuery updates searchQuery", () => {
      useAppStore.getState().setSearchQuery("news");
      expect(useAppStore.getState().searchQuery).toBe("news");
    });

    it("setFavoritesOnly updates favoritesOnly", () => {
      useAppStore.getState().setFavoritesOnly(true);
      expect(useAppStore.getState().favoritesOnly).toBe(true);
    });

    it("setSelectedGroup updates selectedGroup", () => {
      useAppStore.getState().setSelectedGroup("Sports");
      expect(useAppStore.getState().selectedGroup).toBe("Sports");
    });

    it("setError updates error", () => {
      useAppStore.getState().setError("Something went wrong");
      expect(useAppStore.getState().error).toBe("Something went wrong");
    });

    it("setError clears error when null", () => {
      useAppStore.getState().setError("err");
      useAppStore.getState().setError(null);
      expect(useAppStore.getState().error).toBeNull();
    });

    it("clearSourceLists clears groups and channels", () => {
      useAppStore.setState({
        groups: [{ name: "A", channel_count: 5 }],
        channels: [
          {
            id: 1,
            source_id: 1,
            name: "Ch1",
            group_name: "A",
            logo: null,
            tvg_id: null,
            tvg_name: null,
            stream_url: "http://test",
            media_kind: "live",
            is_favorite: false,
          },
        ],
      });

      useAppStore.getState().clearSourceLists();
      expect(useAppStore.getState().groups).toEqual([]);
      expect(useAppStore.getState().channels).toEqual([]);
    });
  });

  describe("setSelectedSourceId", () => {
    it("updates selectedSourceId and persists to localStorage", () => {
      useAppStore.getState().setSelectedSourceId(42);
      expect(useAppStore.getState().selectedSourceId).toBe(42);
      expect(window.localStorage.getItem("opentv:lastSelectedSourceId")).toBe(
        "42"
      );
    });

    it("clears localStorage when set to null", () => {
      useAppStore.getState().setSelectedSourceId(42);
      useAppStore.getState().setSelectedSourceId(null);
      expect(useAppStore.getState().selectedSourceId).toBeNull();
      expect(
        window.localStorage.getItem("opentv:lastSelectedSourceId")
      ).toBeNull();
    });
  });

  describe("setSettings", () => {
    it("updates settings via updater function", () => {
      useAppStore.getState().setSettings((current) => ({
        ...current,
        preferred_player: "mpv",
      }));

      expect(useAppStore.getState().settings.preferred_player).toBe("mpv");
      // other fields unchanged
      expect(useAppStore.getState().settings.hardware_decode).toBe(true);
    });
  });

  describe("loadSources", () => {
    it("loads sources and auto-selects first when none selected", async () => {
      const api = await getSourcesApi();
      api.listRegisteredSources.mockResolvedValue([
        {
          id: 1,
          source_type: "m3u",
          name: "Test",
          config: {},
          created_at: 1000,
        },
        {
          id: 2,
          source_type: "m3u",
          name: "Other",
          config: {},
          created_at: 2000,
        },
      ]);

      await useAppStore.getState().loadSources();
      const state = useAppStore.getState();
      expect(state.sources).toHaveLength(2);
      expect(state.selectedSourceId).toBe(1);
    });

    it("clears selection when no sources exist", async () => {
      const api = await getSourcesApi();
      api.listRegisteredSources.mockResolvedValue([]);

      useAppStore.setState({ selectedSourceId: 5 });
      await useAppStore.getState().loadSources();
      expect(useAppStore.getState().selectedSourceId).toBeNull();
    });
  });

  describe("loadGroups", () => {
    it("sets groups from API response", async () => {
      const api = await getSourcesApi();
      api.listSourceGroups.mockResolvedValue([
        { name: "Sports", channel_count: 20 },
        { name: "News", channel_count: 10 },
      ]);

      await useAppStore.getState().loadGroups(1, "live");
      expect(useAppStore.getState().groups).toEqual([
        { name: "Sports", channel_count: 20 },
        { name: "News", channel_count: 10 },
      ]);
    });
  });

  describe("loadChannels", () => {
    it("fetches channels with current filters", async () => {
      const api = await getChannelsApi();
      const channels = [
        {
          id: 1,
          source_id: 1,
          name: "CNN",
          group_name: "News",
          logo: null,
          tvg_id: null,
          tvg_name: null,
          stream_url: "http://cnn.m3u8",
          media_kind: "live" as const,
          is_favorite: false,
        },
      ];
      api.listSourceChannels.mockResolvedValue(channels);

      useAppStore.setState({ selectedGroup: ALL_GROUPS, searchQuery: "" });
      await useAppStore.getState().loadChannels(1, "live");

      expect(api.listSourceChannels).toHaveBeenCalledWith({
        sourceId: 1,
        mediaKind: "live",
        groupName: null,
        query: null,
        favoritesOnly: false,
      });
      expect(useAppStore.getState().channels).toEqual(channels);
    });

    it("passes group and search when set", async () => {
      const api = await getChannelsApi();
      api.listSourceChannels.mockResolvedValue([]);

      useAppStore.setState({
        selectedGroup: "News",
        searchQuery: "cnn",
        favoritesOnly: true,
      });
      await useAppStore.getState().loadChannels(1, "live");

      expect(api.listSourceChannels).toHaveBeenCalledWith({
        sourceId: 1,
        mediaKind: "live",
        groupName: "News",
        query: "cnn",
        favoritesOnly: true,
      });
    });
  });

  describe("loadRecents", () => {
    it("fetches recent channels", async () => {
      const api = await getRecentsApi();
      const recents = [
        {
          channel: {
            id: 1,
            source_id: 1,
            name: "Ch1",
            group_name: "A",
            logo: null,
            tvg_id: null,
            tvg_name: null,
            stream_url: "http://test",
            media_kind: "live" as const,
            is_favorite: false,
          },
          played_at: 1234567890,
        },
      ];
      api.listRecentlyPlayed.mockResolvedValue(recents);

      await useAppStore.getState().loadRecents();
      expect(useAppStore.getState().recentChannels).toEqual(recents);
    });
  });

  describe("loadSettings", () => {
    it("fetches and sets settings", async () => {
      const api = await getSettingsApi();
      const settings = {
        hardware_decode: false,
        buffering_preset: "normal" as const,
        startup_behavior: "resume_last" as const,
        preferred_player: "mpv" as const,
      };
      api.getPhase1Settings.mockResolvedValue(settings);

      await useAppStore.getState().loadSettings();
      expect(useAppStore.getState().settings).toEqual(settings);
    });
  });

  describe("addM3uSource", () => {
    it("imports source and reloads data", async () => {
      const sourcesApi = await getSourcesApi();
      sourcesApi.addM3uSource.mockResolvedValue({
        source_id: 10,
        imported_channels: 150,
      });
      sourcesApi.listRegisteredSources.mockResolvedValue([
        {
          id: 10,
          source_type: "m3u",
          name: "New",
          config: {},
          created_at: 3000,
        },
      ]);
      sourcesApi.listSourceGroups.mockResolvedValue([]);
      const channelsApi = await getChannelsApi();
      channelsApi.listSourceChannels.mockResolvedValue([]);

      useAppStore.setState({ m3uName: "New", m3uLocation: "http://new.m3u" });
      await useAppStore.getState().addM3uSource("New", "http://new.m3u");

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBe(10);
      expect(state.importMessage).toBe("Imported 150 channels.");
      expect(state.m3uName).toBe("");
      expect(state.m3uLocation).toBe("");
    });

    it("sets error on failure", async () => {
      const sourcesApi = await getSourcesApi();
      sourcesApi.addM3uSource.mockRejectedValue(new Error("Network error"));

      await useAppStore.getState().addM3uSource("Bad", "http://bad.m3u");
      expect(useAppStore.getState().error).toBe("Error: Network error");
    });
  });

  describe("refreshSource", () => {
    it("refreshes selected source and reloads filtered groups/channels", async () => {
      const sourcesApi = await getSourcesApi();
      const channelsApi = await getChannelsApi();
      sourcesApi.refreshM3uSource.mockResolvedValue({
        source_id: 10,
        imported_channels: 7,
      });
      sourcesApi.listSourceGroups.mockResolvedValue([]);
      channelsApi.listSourceChannels.mockResolvedValue([]);

      useAppStore.setState({ selectedSourceId: 10 });
      await useAppStore.getState().refreshSource(10, "live");

      expect(sourcesApi.refreshM3uSource).toHaveBeenCalledWith(10);
      expect(sourcesApi.listSourceGroups).toHaveBeenCalledWith(10, "live");
      expect(channelsApi.listSourceChannels).toHaveBeenCalledWith({
        sourceId: 10,
        mediaKind: "live",
        groupName: null,
        query: null,
        favoritesOnly: false,
      });
      expect(useAppStore.getState().importMessage).toBe("Refreshed 7 channels.");
    });

    it("does not reload groups/channels when source is not selected", async () => {
      const sourcesApi = await getSourcesApi();
      const channelsApi = await getChannelsApi();
      sourcesApi.refreshM3uSource.mockResolvedValue({
        source_id: 10,
        imported_channels: 5,
      });

      useAppStore.setState({ selectedSourceId: 5 });
      await useAppStore.getState().refreshSource(10, "movie");

      expect(sourcesApi.refreshM3uSource).toHaveBeenCalledWith(10);
      expect(sourcesApi.listSourceGroups).not.toHaveBeenCalled();
      expect(channelsApi.listSourceChannels).not.toHaveBeenCalled();
    });
  });

  describe("deleteSource", () => {
    it("deletes source and reloads", async () => {
      const sourcesApi = await getSourcesApi();
      sourcesApi.deleteRegisteredSource.mockResolvedValue(undefined);
      sourcesApi.listRegisteredSources.mockResolvedValue([]);

      const source = {
        id: 1,
        source_type: "m3u",
        name: "Old",
        config: {},
        created_at: 1000,
      };

      await useAppStore.getState().deleteSource(source);

      const state = useAppStore.getState();
      expect(state.selectedGroup).toBe(ALL_GROUPS);
      expect(state.importMessage).toBe('Deleted "Old".');
    });
  });

  describe("playChannel", () => {
    it("sets activeChannel for web player", async () => {
      const playbackApi = await getPlaybackApi();
      const recentsApi = await getRecentsApi();
      playbackApi.recordRecentChannelPlay.mockResolvedValue(undefined);
      recentsApi.listRecentlyPlayed.mockResolvedValue([]);

      const channel = {
        id: 1,
        source_id: 1,
        name: "CNN",
        group_name: "News",
        logo: null,
        tvg_id: null,
        tvg_name: null,
        stream_url: "http://cnn.m3u8",
        media_kind: "live" as const,
        is_favorite: false,
      };

      useAppStore.setState({
        channels: [channel],
        settings: { ...DEFAULT_SETTINGS, preferred_player: "web" },
      });

      await useAppStore.getState().playChannel(1);
      expect(useAppStore.getState().activeChannel).toEqual(channel);
    });

    it("opens MPV for mpv player preference", async () => {
      const playbackApi = await getPlaybackApi();
      const recentsApi = await getRecentsApi();
      playbackApi.openExternalWindow.mockResolvedValue(undefined);
      playbackApi.recordRecentChannelPlay.mockResolvedValue(undefined);
      recentsApi.listRecentlyPlayed.mockResolvedValue([]);

      const channel = {
        id: 1,
        source_id: 1,
        name: "CNN",
        group_name: "News",
        logo: null,
        tvg_id: null,
        tvg_name: null,
        stream_url: "http://cnn.m3u8",
        media_kind: "live" as const,
        is_favorite: false,
      };

      useAppStore.setState({
        channels: [channel],
        settings: { ...DEFAULT_SETTINGS, preferred_player: "mpv" },
      });

      await useAppStore.getState().playChannel(1);
      expect(playbackApi.openExternalWindow).toHaveBeenCalledWith(
        "http://cnn.m3u8"
      );
      expect(useAppStore.getState().activeChannel).toBeNull();
    });

    it("sets error for unknown channelId", async () => {
      useAppStore.setState({ channels: [], recentChannels: [] });
      await useAppStore.getState().playChannel(999);
      expect(useAppStore.getState().error).toContain("channel 999 not found");
    });
  });

  describe("toggleFavorite", () => {
    it("toggles favorite state and reloads channels", async () => {
      const channelsApi = await getChannelsApi();
      const recentsApi = await getRecentsApi();
      channelsApi.setChannelFavoriteState.mockResolvedValue(undefined);
      channelsApi.listSourceChannels.mockResolvedValue([]);
      recentsApi.listRecentlyPlayed.mockResolvedValue([]);

      const channel = {
        id: 1,
        source_id: 1,
        name: "Ch1",
        group_name: "A",
        logo: null,
        tvg_id: null,
        tvg_name: null,
        stream_url: "http://test",
        media_kind: "live" as const,
        is_favorite: false,
      };

      useAppStore.setState({ selectedSourceId: 1 });
      await useAppStore.getState().toggleFavorite(channel);
      expect(channelsApi.setChannelFavoriteState).toHaveBeenCalledWith(1, true);
    });
  });

  describe("setVolume", () => {
    it("updates volume in playback state optimistically", async () => {
      const playbackApi = await getPlaybackApi();
      playbackApi.setVolume.mockResolvedValue(undefined);

      useAppStore.setState({
        playback: {
          state: "playing",
          attached_hwnd: null,
          embedded_surface_hwnd: null,
          current_url: "http://test",
          backend: "mpv",
          last_error: null,
          volume: 50,
          fullscreen: false,
          render_mode: "external_window",
        },
      });

      await useAppStore.getState().setVolume(75);
      expect(useAppStore.getState().playback?.volume).toBe(75);
    });
  });

  describe("logout", () => {
    it("resets selection state and clears localStorage", () => {
      useAppStore.setState({
        selectedSourceId: 5,
        selectedGroup: "Sports",
        activeChannel: {
          id: 1,
          source_id: 1,
          name: "Ch1",
          group_name: "A",
          logo: null,
          tvg_id: null,
          tvg_name: null,
          stream_url: "http://test",
          media_kind: "live",
          is_favorite: false,
        },
        groups: [{ name: "Sports", channel_count: 10 }],
        channels: [],
      });

      window.localStorage.setItem("opentv:lastSelectedSourceId", "5");
      useAppStore.getState().logout();

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBeNull();
      expect(state.hasPersistedSourceSelection).toBe(false);
      expect(state.selectedGroup).toBe(ALL_GROUPS);
      expect(state.activeChannel).toBeNull();
      expect(state.groups).toEqual([]);
      expect(state.channels).toEqual([]);
      expect(
        window.localStorage.getItem("opentv:lastSelectedSourceId")
      ).toBeNull();
    });
  });

  describe("saveSettings", () => {
    it("persists current settings via API and reloads", async () => {
      const settingsApi = await getSettingsApi();
      const newSettings = {
        ...DEFAULT_SETTINGS,
        preferred_player: "mpv" as const,
      };
      settingsApi.setPhase1Settings.mockResolvedValue(undefined);
      settingsApi.getPhase1Settings.mockResolvedValue(newSettings);

      useAppStore.setState({ settings: newSettings });
      await useAppStore.getState().saveSettings();

      expect(settingsApi.setPhase1Settings).toHaveBeenCalledWith(newSettings);
      expect(useAppStore.getState().settings).toEqual(newSettings);
    });
  });
});
