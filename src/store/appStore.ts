import { create } from 'zustand';
import {
  ALL_GROUPS,
  ChannelRecord,
  DEFAULT_SETTINGS,
  Phase1Settings,
  PlaybackStatus,
  PlayerEnvironment,
  SourceRecord,
} from '../components/app/types';
import * as channelsApi from '../lib/api/channelsApi';
import * as playbackApi from '../lib/api/playbackApi';
import * as recentsApi from '../lib/api/recentsApi';
import * as settingsApi from '../lib/api/settingsApi';
import * as sourcesApi from '../lib/api/sourcesApi';
import { displayTitle } from '../lib/catalog/cleanName';

const LAST_SELECTED_SOURCE_KEY = 'silkcast:lastSelectedSourceId';
const THEME_PREFERENCE_KEY = 'silkcast:theme';

export type AppTheme = 'light' | 'dark';

const isValidSourceId = (value: number) => Number.isInteger(value) && value > 0;

const isAppTheme = (value: unknown): value is AppTheme =>
  value === 'light' || value === 'dark';

const normalizeSourceId = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return isValidSourceId(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized === '') {
      return null;
    }

    const parsed = Number(normalized);
    return isValidSourceId(parsed) ? parsed : null;
  }

  return null;
};

const normalizeSourceRecord = (source: SourceRecord): SourceRecord | null => {
  const normalizedSourceId = normalizeSourceId(
    (source as SourceRecord & { id: unknown }).id
  );
  if (normalizedSourceId === null) {
    return null;
  }

  return source.id === normalizedSourceId
    ? source
    : {
        ...source,
        id: normalizedSourceId,
      };
};

const readLastSelectedSourceId = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(LAST_SELECTED_SOURCE_KEY);
  return normalizeSourceId(rawValue);
};

const writeLastSelectedSourceId = (sourceId: number | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedSourceId = normalizeSourceId(sourceId);
  if (normalizedSourceId === null) {
    window.localStorage.removeItem(LAST_SELECTED_SOURCE_KEY);
    return;
  }

  window.localStorage.setItem(
    LAST_SELECTED_SOURCE_KEY,
    normalizedSourceId.toString()
  );
};

// SilkCast is dark-first (it's a media app); light is an explicit choice in Settings.
const readStoredThemePreference = (): AppTheme => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const storedTheme = window.localStorage.getItem(THEME_PREFERENCE_KEY);
  return isAppTheme(storedTheme) ? storedTheme : 'dark';
};

const writeThemePreference = (theme: AppTheme) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(THEME_PREFERENCE_KEY, theme);
};

/**
 * Watch history is best-effort: a failure here (e.g. a channel id that changed
 * in a concurrent refresh) must never block playback.
 */
async function recordRecentPlay(
  channelId: number,
  reload: () => Promise<void>
) {
  try {
    await playbackApi.recordRecentChannelPlay(channelId);
    await reload();
  } catch {
    // Ignored on purpose; see above.
  }
}

const DEFAULT_PLAYER_ENVIRONMENT: PlayerEnvironment = {
  stream_proxy_base_url: null,
  mpv_available: true,
};

const initialSelectedSourceId = readLastSelectedSourceId();
const initialTheme = readStoredThemePreference();

type AppState = {
  sources: SourceRecord[];
  selectedSourceId: number | null;
  hasPersistedSourceSelection: boolean;
  groups: { name: string; channel_count: number }[];
  selectedGroup: string;
  channels: ChannelRecord[];
  recentChannels: { channel: ChannelRecord; played_at: number }[];
  activeChannel: ChannelRecord | null;
  /** Items the player can step through with previous/next (channels or episodes). */
  playbackQueue: ChannelRecord[];
  /** Null until the backend reports proxy/MPV availability. */
  playerEnvironment: PlayerEnvironment | null;
  playback: PlaybackStatus | null;
  settings: Phase1Settings;
  theme: AppTheme;
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
  setActiveChannel: (channel: ChannelRecord | null) => void;
  setSettings: (updater: (current: Phase1Settings) => Phase1Settings) => void;
  setTheme: (theme: AppTheme) => void;
  setPlayback: (playback: PlaybackStatus) => void;
  setError: (error: string | null) => void;
  clearSourceLists: () => void;
  loadSources: () => Promise<void>;
  loadGroups: (
    sourceId: number,
    mediaKind?: 'live' | 'movie' | 'series' | null
  ) => Promise<void>;
  loadChannels: (
    sourceId: number,
    mediaKind?: 'live' | 'movie' | 'series' | null
  ) => Promise<void>;
  loadRecents: () => Promise<void>;
  openChannelInMpv: (
    channel: ChannelRecord,
    options?: { startSeconds?: number | null }
  ) => Promise<void>;
  loadPlayerEnvironment: () => Promise<void>;
  loadPlaybackStatus: () => Promise<void>;
  loadSettings: () => Promise<void>;
  refreshEverything: () => Promise<void>;
  addM3uSource: (name: string, location: string) => Promise<void>;
  addXtreamSource: (
    name: string,
    serverUrl: string,
    username: string,
    password: string
  ) => Promise<void>;
  updateSource: (
    sourceId: number,
    name: string,
    config: Record<string, unknown>,
    mediaKind?: 'live' | 'movie' | 'series' | null
  ) => Promise<void>;

  refreshSource: (
    sourceId: number,
    mediaKind?: 'live' | 'movie' | 'series' | null
  ) => Promise<void>;
  playChannel: (channelId: number) => Promise<void>;
  playChannelRecord: (
    channel: ChannelRecord,
    queue?: ChannelRecord[]
  ) => Promise<void>;
  toggleFavorite: (channel: ChannelRecord) => Promise<void>;
  deleteSource: (source: SourceRecord) => Promise<void>;
  pausePlayback: (paused: boolean) => Promise<void>;
  stopPlayback: () => Promise<void>;
  saveFullscreenState: (fullscreen: boolean) => Promise<void>;
  setVolume: (nextVolume: number) => Promise<void>;
  seekPlayback: (seconds: number) => Promise<void>;
  saveSettings: () => Promise<void>;
  logout: () => void;
  /** Lets the sources page open without the startup redirect to the dashboard. */
  manageSources: () => void;
};

type AppStore = AppState & AppActions;

const initialState: AppState = {
  sources: [],
  selectedSourceId: initialSelectedSourceId,
  hasPersistedSourceSelection: initialSelectedSourceId !== null,
  groups: [],
  selectedGroup: ALL_GROUPS,
  channels: [],
  recentChannels: [],
  activeChannel: null,
  playbackQueue: [],
  playerEnvironment: null,
  playback: null,
  settings: DEFAULT_SETTINGS,
  theme: initialTheme,
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
  setSelectedSourceId: (sourceId) => {
    const normalizedSourceId = normalizeSourceId(sourceId);
    writeLastSelectedSourceId(normalizedSourceId);
    set({
      selectedSourceId: normalizedSourceId,
      hasPersistedSourceSelection: false,
    });
  },
  setSelectedGroup: (groupName) => set({ selectedGroup: groupName }),
  setActiveChannel: (channel) => set({ activeChannel: channel }),
  setSettings: (updater) =>
    set((state) => ({ settings: updater(state.settings) })),
  setTheme: (theme) => {
    writeThemePreference(theme);
    set({ theme });
  },
  setPlayback: (playback) => set({ playback }),
  setError: (error) => set({ error }),
  clearSourceLists: () => set({ groups: [], channels: [] }),

  loadSources: async () => {
    const sourceListResponse = await sourcesApi.listRegisteredSources();
    const sourceList = sourceListResponse
      .map(normalizeSourceRecord)
      .filter((source): source is SourceRecord => source !== null);

    set((state) => {
      if (sourceList.length === 0) {
        writeLastSelectedSourceId(null);
        return {
          sources: sourceList,
          selectedSourceId: null,
          hasPersistedSourceSelection: false,
        };
      }

      const rememberedSourceId = readLastSelectedSourceId();
      const persistedSelectionIsValid =
        rememberedSourceId !== null &&
        sourceList.some((source) => source.id === rememberedSourceId);

      const normalizedInMemorySelection = normalizeSourceId(
        state.selectedSourceId
      );
      const inMemorySelectionIsValid =
        normalizedInMemorySelection !== null &&
        sourceList.some((source) => source.id === normalizedInMemorySelection);

      const selectedSourceId = persistedSelectionIsValid
        ? rememberedSourceId
        : inMemorySelectionIsValid
          ? normalizedInMemorySelection
          : sourceList[0].id;

      return {
        sources: sourceList,
        selectedSourceId,
        hasPersistedSourceSelection: persistedSelectionIsValid,
      };
    });
  },

  loadGroups: async (sourceId, mediaKind = null) => {
    const groups = await sourcesApi.listSourceGroups(sourceId, mediaKind);
    set({ groups });
  },

  loadChannels: async (sourceId, mediaKind = null) => {
    const { selectedGroup, searchQuery, favoritesOnly } = get();
    const groupName = selectedGroup === ALL_GROUPS ? null : selectedGroup;
    const query = searchQuery.trim() === '' ? null : searchQuery;

    const channels = await channelsApi.listSourceChannels({
      sourceId,
      mediaKind,
      groupName,
      query,
      favoritesOnly,
    });

    set({ channels });
  },

  loadRecents: async () => {
    const RECENTS_PER_TYPE = 20;
    const totalLimit = RECENTS_PER_TYPE * 3;
    const recentChannels = await recentsApi.listRecentlyPlayed(totalLimit);
    set({ recentChannels });
  },

  openChannelInMpv: async (channel, options = {}) => {
    set({ error: null });
    try {
      await playbackApi.openExternalWindow(channel.stream_url, {
        title: displayTitle(channel.name),
        startSeconds: options.startSeconds ?? null,
      });
      set({ activeChannel: null });
      await recordRecentPlay(channel.id, get().loadRecents);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  loadPlayerEnvironment: async () => {
    try {
      const playerEnvironment = await playbackApi.getPlayerEnvironment();
      set({ playerEnvironment: playerEnvironment ?? DEFAULT_PLAYER_ENVIRONMENT });
    } catch {
      // Older backends lack the command; fall back to direct stream URLs.
      set({ playerEnvironment: DEFAULT_PLAYER_ENVIRONMENT });
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
        get().loadPlayerEnvironment(),
      ]);

      const { settings, recentChannels, activeChannel } = get();
      if (
        settings.startup_behavior === 'resume_last' &&
        settings.preferred_player === 'web' &&
        recentChannels.length > 0 &&
        activeChannel === null
      ) {
        set({
          activeChannel: recentChannels[0].channel,
          playbackQueue: [recentChannels[0].channel],
        });
      }
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
      writeLastSelectedSourceId(result.source_id);
      set({
        m3uName: '',
        m3uLocation: '',
        selectedSourceId: result.source_id,
        hasPersistedSourceSelection: false,
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

  addXtreamSource: async (name, serverUrl, username, password) => {
    set({ error: null, importMessage: null });

    try {
      const result = await sourcesApi.addXtreamSource(
        name,
        serverUrl,
        username,
        password
      );
      writeLastSelectedSourceId(result.source_id);
      set({
        selectedSourceId: result.source_id,
        hasPersistedSourceSelection: false,
        selectedGroup: ALL_GROUPS,
        importMessage: `Imported ${result.imported_channels} catalog items.`,
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

  updateSource: async (sourceId, name, config, mediaKind = null) => {
    set({ error: null, importMessage: null });

    try {
      const source = get().sources.find((item) => item.id === sourceId) ?? null;
      if (!source) {
        throw new Error(`source ${sourceId} not found in local state`);
      }

      const result = await sourcesApi.updateRegisteredSource(
        sourceId,
        name,
        config
      );

      await get().loadSources();

      if (sourceId === get().selectedSourceId) {
        await Promise.all([
          get().loadGroups(sourceId, mediaKind),
          get().loadChannels(sourceId, mediaKind),
        ]);
      }

      set({
        importMessage:
          source.source_type === 'xtream'
            ? `Updated source and imported ${result.imported_channels} catalog items.`
            : `Updated source and imported ${result.imported_channels} channels.`,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  refreshSource: async (sourceId, mediaKind = null) => {
    set({ error: null, importMessage: null });

    try {
      const source = get().sources.find((item) => item.id === sourceId) ?? null;
      const result = await sourcesApi.refreshRegisteredSource(sourceId);
      set({
        importMessage:
          source?.source_type === 'xtream'
            ? `Refreshed ${result.imported_channels} catalog items.`
            : `Refreshed ${result.imported_channels} channels.`,
      });

      if (sourceId === get().selectedSourceId) {
        await Promise.all([
          get().loadGroups(sourceId, mediaKind),
          get().loadChannels(sourceId, mediaKind),
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
        get().recentChannels.find((item) => item.channel.id === channelId)
          ?.channel;
      if (!channel) {
        throw new Error(`channel ${channelId} not found in local state`);
      }

      if (get().settings.preferred_player === 'mpv') {
        await playbackApi.openExternalWindow(channel.stream_url, {
          title: displayTitle(channel.name),
        });
        set({ activeChannel: null });
      } else {
        set({ activeChannel: channel, playbackQueue: [channel] });
      }

      await recordRecentPlay(channelId, get().loadRecents);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  playChannelRecord: async (channel, queue) => {
    set({ error: null });

    try {
      if (get().settings.preferred_player === 'mpv') {
        await playbackApi.openExternalWindow(channel.stream_url, {
          title: displayTitle(channel.name),
        });
        set({ activeChannel: null });
      } else {
        set({
          activeChannel: channel,
          playbackQueue: queue && queue.length > 0 ? queue : [channel],
        });
      }

      await recordRecentPlay(channel.id, get().loadRecents);
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
    const deletingSelectedSource = get().selectedSourceId === source.id;
    const activeChannelBelongsToSource =
      get().activeChannel?.source_id === source.id;

    set({
      error: null,
      importMessage: null,
      selectedGroup: ALL_GROUPS,
      activeChannel: activeChannelBelongsToSource ? null : get().activeChannel,
      playbackQueue: activeChannelBelongsToSource ? [] : get().playbackQueue,
    });

    try {
      await sourcesApi.deleteRegisteredSource(source.id);
      await get().loadSources();

      if (deletingSelectedSource) {
        const nextSelectedSourceId = get().selectedSourceId;

        if (nextSelectedSourceId === null) {
          get().clearSourceLists();
        } else {
          await Promise.all([
            get().loadGroups(nextSelectedSourceId),
            get().loadChannels(nextSelectedSourceId),
          ]);
        }
      }

      set({
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

  manageSources: () => set({ hasPersistedSourceSelection: false }),

  logout: () => {
    writeLastSelectedSourceId(null);
    set({
      selectedSourceId: null,
      hasPersistedSourceSelection: false,
      selectedGroup: ALL_GROUPS,
      activeChannel: null,
      playbackQueue: [],
      groups: [],
      channels: [],
    });
  },
}));
