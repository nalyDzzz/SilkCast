import { create } from 'zustand';
import {
  ALL_GROUPS,
  ChannelRecord,
  DEFAULT_SETTINGS,
  Phase1Settings,
  PlaybackStatus,
  SourceRecord,
} from '../components/app/types';
import * as channelsApi from '../lib/api/channelsApi';
import * as playbackApi from '../lib/api/playbackApi';
import * as recentsApi from '../lib/api/recentsApi';
import * as settingsApi from '../lib/api/settingsApi';
import * as sourcesApi from '../lib/api/sourcesApi';

type AppState = {
  sources: SourceRecord[];
  selectedSourceId: number | null;
  groups: { name: string; channel_count: number }[];
  selectedGroup: string;
  channels: ChannelRecord[];
  recentChannels: { channel: ChannelRecord; played_at: number }[];
  activeChannel: ChannelRecord | null;
  playback: PlaybackStatus | null;
  settings: Phase1Settings;
  m3uName: string;
  m3uLocation: string;
  searchQuery: string;
  favoritesOnly: boolean;
  error: string | null;
  loading: boolean;
  importMessage: string | null;
};

type AppActions = {
  setM3uName: (value: string) => void;
  setM3uLocation: (value: string) => void;
  setSearchQuery: (value: string) => void;
  setFavoritesOnly: (value: boolean) => void;
  setSelectedSourceId: (sourceId: number | null) => void;
  setSelectedGroup: (groupName: string) => void;
  setSettings: (updater: (current: Phase1Settings) => Phase1Settings) => void;
  setPlayback: (playback: PlaybackStatus) => void;
  setError: (error: string | null) => void;
  clearSourceLists: () => void;
  loadSources: () => Promise<void>;
  loadGroups: (sourceId: number) => Promise<void>;
  loadChannels: (sourceId: number) => Promise<void>;
  loadRecents: () => Promise<void>;
  openChannelInMpv: (channel: ChannelRecord) => Promise<void>;
  loadPlaybackStatus: () => Promise<void>;
  loadSettings: () => Promise<void>;
  refreshEverything: () => Promise<void>;
  addM3uSource: (name: string, location: string) => Promise<void>;
  refreshSource: (sourceId: number) => Promise<void>;
  playChannel: (channelId: number) => Promise<void>;
  toggleFavorite: (channel: ChannelRecord) => Promise<void>;
  deleteSource: (source: SourceRecord) => Promise<void>;
  pausePlayback: (paused: boolean) => Promise<void>;
  stopPlayback: () => Promise<void>;
  saveFullscreenState: (fullscreen: boolean) => Promise<void>;
  setVolume: (nextVolume: number) => Promise<void>;
  seekPlayback: (seconds: number) => Promise<void>;
  saveSettings: () => Promise<void>;
};

type AppStore = AppState & AppActions;

const initialState: AppState = {
  sources: [],
  selectedSourceId: null,
  groups: [],
  selectedGroup: ALL_GROUPS,
  channels: [],
  recentChannels: [],
  activeChannel: null,
  playback: null,
  settings: DEFAULT_SETTINGS,
  m3uName: '',
  m3uLocation: '',
  searchQuery: '',
  favoritesOnly: false,
  error: null,
  loading: false,
  importMessage: null,
};

export const useAppStore = create<AppStore>((set, get) => ({
  ...initialState,

  setM3uName: (value) => set({ m3uName: value }),
  setM3uLocation: (value) => set({ m3uLocation: value }),
  setSearchQuery: (value) => set({ searchQuery: value }),
  setFavoritesOnly: (value) => set({ favoritesOnly: value }),
  setSelectedSourceId: (sourceId) => set({ selectedSourceId: sourceId }),
  setSelectedGroup: (groupName) => set({ selectedGroup: groupName }),
  setSettings: (updater) =>
    set((state) => ({ settings: updater(state.settings) })),
  setPlayback: (playback) => set({ playback }),
  setError: (error) => set({ error }),
  clearSourceLists: () => set({ groups: [], channels: [] }),

  loadSources: async () => {
    const sourceList = await sourcesApi.listRegisteredSources();

    set((state) => {
      if (sourceList.length === 0) {
        return {
          sources: sourceList,
          selectedSourceId: null,
        };
      }

      const selectedSourceId =
        state.selectedSourceId !== null &&
        sourceList.some((source) => source.id === state.selectedSourceId)
          ? state.selectedSourceId
          : sourceList[0].id;

      return {
        sources: sourceList,
        selectedSourceId,
      };
    });
  },

  loadGroups: async (sourceId) => {
    const groups = await sourcesApi.listSourceGroups(sourceId);
    set({ groups });
  },

  loadChannels: async (sourceId) => {
    const { selectedGroup, searchQuery, favoritesOnly } = get();
    const groupName = selectedGroup === ALL_GROUPS ? null : selectedGroup;
    const query = searchQuery.trim() === '' ? null : searchQuery;

    const channels = await channelsApi.listSourceChannels({
      sourceId,
      groupName,
      query,
      favoritesOnly,
    });

    set({ channels });
  },

  loadRecents: async () => {
    const recentChannels = await recentsApi.listRecentlyPlayed(20);
    set({ recentChannels });
  },

  openChannelInMpv: async (channel) => {
    set({ error: null });
    try {
      await playbackApi.openExternalWindow(channel.stream_url);
      set({ activeChannel: null });
      await playbackApi.recordRecentChannelPlay(channel.id);
      await get().loadRecents();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  loadPlaybackStatus: async () => {
    const playback = await playbackApi.getPlaybackState();
    set({ playback });
  },

  loadSettings: async () => {
    const settings = await settingsApi.getPhase1Settings();
    set({ settings });
  },

  refreshEverything: async () => {
    set({ loading: true, error: null });
    try {
      await Promise.all([
        get().loadSources(),
        get().loadPlaybackStatus(),
        get().loadRecents(),
        get().loadSettings(),
      ]);
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },

  addM3uSource: async (name, location) => {
    set({ error: null, importMessage: null });

    try {
      const result = await sourcesApi.addM3uSource(name, location);
      set({
        m3uName: '',
        m3uLocation: '',
        selectedSourceId: result.source_id,
        selectedGroup: ALL_GROUPS,
        importMessage: `Imported ${result.imported_channels} channels.`,
      });

      await Promise.all([
        get().loadSources(),
        get().loadGroups(result.source_id),
        get().loadChannels(result.source_id),
      ]);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  refreshSource: async (sourceId) => {
    set({ error: null, importMessage: null });

    try {
      const result = await sourcesApi.refreshM3uSource(sourceId);
      set({ importMessage: `Refreshed ${result.imported_channels} channels.` });

      if (sourceId === get().selectedSourceId) {
        await Promise.all([
          get().loadGroups(sourceId),
          get().loadChannels(sourceId),
        ]);
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  playChannel: async (channelId) => {
    set({ error: null });

    try {
      const channel =
        get().channels.find((item) => item.id === channelId) ??
        get().recentChannels.find((item) => item.channel.id === channelId)?.channel;
      if (!channel) {
        throw new Error(`channel ${channelId} not found in local state`);
      }

      set({ activeChannel: channel });
      await playbackApi.recordRecentChannelPlay(channelId);
      await get().loadRecents();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  toggleFavorite: async (channel) => {
    set({ error: null });

    try {
      await channelsApi.setChannelFavoriteState(
        channel.id,
        !channel.is_favorite
      );

      const selectedSourceId = get().selectedSourceId;
      if (selectedSourceId !== null) {
        await get().loadChannels(selectedSourceId);
      }

      await get().loadRecents();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteSource: async (source) => {
    set({ error: null, importMessage: null });

    try {
      await sourcesApi.deleteRegisteredSource(source.id);
      await get().loadSources();
      set({
        selectedGroup: ALL_GROUPS,
        importMessage: `Deleted "${source.name}".`,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  pausePlayback: async (paused) => {
    set({ error: null });

    try {
      await playbackApi.pausePlayback(paused);
      await get().loadPlaybackStatus();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  stopPlayback: async () => {
    set({ error: null });

    try {
      await playbackApi.stopPlayback();
      await get().loadPlaybackStatus();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  saveFullscreenState: async (fullscreen) => {
    set({ error: null });

    try {
      await playbackApi.setFullscreen(fullscreen);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setVolume: async (nextVolume) => {
    set({ error: null });

    try {
      await playbackApi.setVolume(nextVolume);
      set((state) => ({
        playback: state.playback
          ? {
              ...state.playback,
              volume: nextVolume,
            }
          : state.playback,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  seekPlayback: async (seconds) => {
    set({ error: null });

    try {
      await playbackApi.seekPlayback(seconds);
      await get().loadPlaybackStatus();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  saveSettings: async () => {
    set({ error: null });

    try {
      await settingsApi.setPhase1Settings(get().settings);
      await get().loadSettings();
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
