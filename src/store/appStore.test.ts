import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useAppStore } from './appStore';
import { DEFAULT_SETTINGS } from '../components/app/types';

// Mock all API modules
vi.mock('../lib/api/channelsApi', () => ({
  listSourceChannels: vi.fn(),
  setChannelFavoriteState: vi.fn(),
}));

vi.mock('../lib/api/sourcesApi', () => ({
  listRegisteredSources: vi.fn(),
  listSourceGroups: vi.fn(),
  addM3uSource: vi.fn(),
  addXtreamSource: vi.fn(),
  refreshRegisteredSource: vi.fn(),
  deleteRegisteredSource: vi.fn(),
}));

vi.mock('../lib/api/playbackApi', () => ({
  getPlaybackState: vi.fn(),
  openExternalWindow: vi.fn(),
  recordRecentChannelPlay: vi.fn(),
  pausePlayback: vi.fn(),
  stopPlayback: vi.fn(),
  setFullscreen: vi.fn(),
  setVolume: vi.fn(),
  seekPlayback: vi.fn(),
}));

vi.mock('../lib/api/recentsApi', () => ({
  listRecentlyPlayed: vi.fn(),
}));

vi.mock('../lib/api/settingsApi', () => ({
  getPhase1Settings: vi.fn(),
  setPhase1Settings: vi.fn(),
}));

// Lazy imports so mocks are applied first
const getSourcesApi = () =>
  import('../lib/api/sourcesApi') as unknown as Promise<{
    listRegisteredSources: Mock;
    listSourceGroups: Mock;
    addM3uSource: Mock;
    addXtreamSource: Mock;
    refreshRegisteredSource: Mock;
    deleteRegisteredSource: Mock;
  }>;

const getPlaybackApi = () =>
  import('../lib/api/playbackApi') as unknown as Promise<{
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
  import('../lib/api/recentsApi') as unknown as Promise<{
    listRecentlyPlayed: Mock;
  }>;

const getSettingsApi = () =>
  import('../lib/api/settingsApi') as unknown as Promise<{
    getPhase1Settings: Mock;
    setPhase1Settings: Mock;
  }>;

const getChannelsApi = () =>
  import('../lib/api/channelsApi') as unknown as Promise<{
    listSourceChannels: Mock;
    setChannelFavoriteState: Mock;
  }>;

function resetStore() {
  useAppStore.setState({
    sources: [],
    selectedSourceId: null,
    hasPersistedSourceSelection: false,
    recentChannels: [],
    activeChannel: null,
    playback: null,
    settings: DEFAULT_SETTINGS,
    theme: 'light',
    m3uName: '',
    m3uLocation: '',
    error: null,
    loading: false,
    importMessage: null,
  });
}

describe('appStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useAppStore.getState();
      expect(state.sources).toEqual([]);
      expect(state.selectedSourceId).toBeNull();
      expect(state.recentChannels).toEqual([]);
      expect(state.activeChannel).toBeNull();
      expect(state.playback).toBeNull();
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
      expect(state.theme).toBe('light');
      expect(state.error).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.importMessage).toBeNull();
    });
  });

  describe('simple setters', () => {
    it('setM3uName updates m3uName', () => {
      useAppStore.getState().setM3uName('My Playlist');
      expect(useAppStore.getState().m3uName).toBe('My Playlist');
    });

    it('setM3uLocation updates m3uLocation', () => {
      useAppStore.getState().setM3uLocation('https://example.com/list.m3u');
      expect(useAppStore.getState().m3uLocation).toBe(
        'https://example.com/list.m3u'
      );
    });

    it('setError updates error', () => {
      useAppStore.getState().setError('Something went wrong');
      expect(useAppStore.getState().error).toBe('Something went wrong');
    });

    it('setError clears error when null', () => {
      useAppStore.getState().setError('err');
      useAppStore.getState().setError(null);
      expect(useAppStore.getState().error).toBeNull();
    });
    it('setTheme updates theme and persists to localStorage', () => {
      useAppStore.getState().setTheme('dark');

      expect(useAppStore.getState().theme).toBe('dark');
      expect(window.localStorage.getItem('silkcast:theme')).toBe('dark');
    });
  });


  describe('setSelectedSourceId', () => {
    it('updates selectedSourceId and persists to localStorage', () => {
      useAppStore.getState().setSelectedSourceId(42);
      expect(useAppStore.getState().selectedSourceId).toBe(42);
      expect(window.localStorage.getItem('silkcast:lastSelectedSourceId')).toBe(
        '42'
      );
    });

    it('clears localStorage when set to null', () => {
      useAppStore.getState().setSelectedSourceId(42);
      useAppStore.getState().setSelectedSourceId(null);
      expect(useAppStore.getState().selectedSourceId).toBeNull();
      expect(
        window.localStorage.getItem('silkcast:lastSelectedSourceId')
      ).toBeNull();
    });

    it('normalizes invalid source ids to null', () => {
      useAppStore.getState().setSelectedSourceId(Number.NaN);
      expect(useAppStore.getState().selectedSourceId).toBeNull();
      expect(
        window.localStorage.getItem('silkcast:lastSelectedSourceId')
      ).toBeNull();
    });
  });

  describe('setSettings', () => {
    it('updates settings via updater function', () => {
      useAppStore.getState().setSettings((current) => ({
        ...current,
        preferred_player: 'mpv',
      }));

      expect(useAppStore.getState().settings.preferred_player).toBe('mpv');
      // other fields unchanged
      expect(useAppStore.getState().settings.hardware_decode).toBe(true);
    });
  });

  describe('loadSources', () => {
    it('loads sources and auto-selects first when none selected', async () => {
      const api = await getSourcesApi();
      api.listRegisteredSources.mockResolvedValue([
        {
          id: 1,
          source_type: 'm3u',
          name: 'Test',
          config: {},
          created_at: 1000,
        },
        {
          id: 2,
          source_type: 'm3u',
          name: 'Other',
          config: {},
          created_at: 2000,
        },
      ]);

      await useAppStore.getState().loadSources();
      const state = useAppStore.getState();
      expect(state.sources).toHaveLength(2);
      expect(state.selectedSourceId).toBe(1);
    });

    it('clears selection when no sources exist', async () => {
      const api = await getSourcesApi();
      api.listRegisteredSources.mockResolvedValue([]);

      useAppStore.setState({ selectedSourceId: 5 });
      await useAppStore.getState().loadSources();
      expect(useAppStore.getState().selectedSourceId).toBeNull();
    });

    it('keeps persisted selection when source ids are numeric strings', async () => {
      const api = await getSourcesApi();
      api.listRegisteredSources.mockResolvedValue([
        {
          id: 1,
          source_type: 'm3u',
          name: 'M3U Source',
          config: {},
          created_at: 1000,
        },
        {
          id: '2' as unknown as number,
          source_type: 'xtream',
          name: 'Xtream Source',
          config: {},
          created_at: 2000,
        },
      ]);

      window.localStorage.setItem('silkcast:lastSelectedSourceId', '2');

      await useAppStore.getState().loadSources();

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBe(2);
      expect(state.hasPersistedSourceSelection).toBe(true);
      expect(
        state.sources.find((source) => source.name === 'Xtream Source')?.id
      ).toBe(2);
      expect(window.localStorage.getItem('silkcast:lastSelectedSourceId')).toBe(
        '2'
      );
    });

    it('does not persist fallback auto-selection across repeated loads', async () => {
      const api = await getSourcesApi();
      api.listRegisteredSources.mockResolvedValue([
        {
          id: 7,
          source_type: 'xtream',
          name: 'Provider',
          config: {},
          created_at: 1000,
        },
      ]);

      window.localStorage.removeItem('silkcast:lastSelectedSourceId');

      await useAppStore.getState().loadSources();
      expect(useAppStore.getState().selectedSourceId).toBe(7);
      expect(useAppStore.getState().hasPersistedSourceSelection).toBe(false);
      expect(
        window.localStorage.getItem('silkcast:lastSelectedSourceId')
      ).toBeNull();

      await useAppStore.getState().loadSources();
      expect(useAppStore.getState().selectedSourceId).toBe(7);
      expect(useAppStore.getState().hasPersistedSourceSelection).toBe(false);
    });
  });

  describe('loadRecents', () => {
    it('fetches enough recents to cover all media kinds', async () => {
      const api = await getRecentsApi();
      const recents = [
        {
          channel: {
            id: 1,
            source_id: 1,
            name: 'Ch1',
            group_name: 'A',
            logo: null,
            tvg_id: null,
            tvg_name: null,
            stream_url: 'http://test',
            media_kind: 'live' as const,
            is_favorite: false,
          },
          played_at: 1234567890,
        },
      ];
      api.listRecentlyPlayed.mockResolvedValue(recents);

      await useAppStore.getState().loadRecents();
      expect(api.listRecentlyPlayed).toHaveBeenCalledWith(60);
      expect(useAppStore.getState().recentChannels).toEqual(recents);
    });
  });


  describe('refreshEverything', () => {
    it('refreshes startup payload with enough recents for all media kinds', async () => {
      const sourcesApi = await getSourcesApi();
      const playbackApi = await getPlaybackApi();
      const settingsApi = await getSettingsApi();
      const recentsApi = await getRecentsApi();

      sourcesApi.listRegisteredSources.mockResolvedValue([]);
      playbackApi.getPlaybackState.mockResolvedValue(null);
      settingsApi.getPhase1Settings.mockResolvedValue(DEFAULT_SETTINGS);
      recentsApi.listRecentlyPlayed.mockResolvedValue([]);

      await useAppStore.getState().refreshEverything();

      expect(recentsApi.listRecentlyPlayed).toHaveBeenCalledWith(60);
      expect(sourcesApi.listRegisteredSources).toHaveBeenCalledTimes(1);
      expect(playbackApi.getPlaybackState).toHaveBeenCalledTimes(1);
      expect(settingsApi.getPhase1Settings).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadSettings', () => {
    it('fetches and sets settings', async () => {
      const api = await getSettingsApi();
      const settings = {
        hardware_decode: false,
        buffering_preset: 'normal' as const,
        startup_behavior: 'resume_last' as const,
        preferred_player: 'mpv' as const,
      };
      api.getPhase1Settings.mockResolvedValue(settings);

      await useAppStore.getState().loadSettings();
      expect(useAppStore.getState().settings).toEqual(settings);
    });
  });

  describe('addM3uSource', () => {
    it('imports source and reloads data', async () => {
      const sourcesApi = await getSourcesApi();
      sourcesApi.addM3uSource.mockResolvedValue({
        source_id: 10,
        imported_channels: 150,
      });
      sourcesApi.listRegisteredSources.mockResolvedValue([
        {
          id: 10,
          source_type: 'm3u',
          name: 'New',
          config: {},
          created_at: 3000,
        },
      ]);
      const channelsApi = await getChannelsApi();

      useAppStore.setState({ m3uName: 'New', m3uLocation: 'http://new.m3u' });
      await useAppStore.getState().addM3uSource('New', 'http://new.m3u');

      const state = useAppStore.getState();
      // Catalog pages load their own items; the whole catalog isn't fetched here.
      expect(channelsApi.listSourceChannels).not.toHaveBeenCalled();
      expect(state.sources.map((source) => source.id)).toEqual([10]);
      expect(state.selectedSourceId).toBe(10);
      expect(state.importMessage).toBe('Imported 150 channels.');
      expect(state.m3uName).toBe('');
      expect(state.m3uLocation).toBe('');
    });

    it('sets error on failure', async () => {
      const sourcesApi = await getSourcesApi();
      sourcesApi.addM3uSource.mockRejectedValue(new Error('Network error'));

      await useAppStore.getState().addM3uSource('Bad', 'http://bad.m3u');
      expect(useAppStore.getState().error).toBe('Error: Network error');
    });
  });

  describe('addXtreamSource', () => {
    it('imports an xtream source and reloads data', async () => {
      const sourcesApi = await getSourcesApi();
      sourcesApi.addXtreamSource.mockResolvedValue({
        source_id: 22,
        imported_channels: 48,
      });
      sourcesApi.listRegisteredSources.mockResolvedValue([
        {
          id: 22,
          source_type: 'xtream',
          name: 'Provider',
          config: {},
          created_at: 3000,
        },
      ]);
      await useAppStore
        .getState()
        .addXtreamSource(
          'Provider',
          'https://provider.example:8080',
          'alice',
          'secret'
        );

      expect(sourcesApi.addXtreamSource).toHaveBeenCalledWith(
        'Provider',
        'https://provider.example:8080',
        'alice',
        'secret'
      );

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBe(22);
      expect(state.importMessage).toBe('Imported 48 catalog items.');
    });
  });

  describe('refreshSource', () => {
    it('refreshes the source without fetching its whole catalog', async () => {
      const sourcesApi = await getSourcesApi();
      const channelsApi = await getChannelsApi();
      sourcesApi.refreshRegisteredSource.mockResolvedValue({
        source_id: 10,
        imported_channels: 7,
      });

      useAppStore.setState({
        selectedSourceId: 10,
        sources: [
          {
            id: 10,
            source_type: 'm3u',
            name: 'Playlist',
            config: {},
            created_at: 1000,
          },
        ],
      });
      await useAppStore.getState().refreshSource(10);

      expect(sourcesApi.refreshRegisteredSource).toHaveBeenCalledWith(10);
      expect(channelsApi.listSourceChannels).not.toHaveBeenCalled();
      expect(useAppStore.getState().importMessage).toBe(
        'Refreshed 7 channels.'
      );
    });

    it('uses xtream messaging for xtream sources', async () => {
      const sourcesApi = await getSourcesApi();
      sourcesApi.refreshRegisteredSource.mockResolvedValue({
        source_id: 12,
        imported_channels: 99,
      });

      useAppStore.setState({
        selectedSourceId: 12,
        sources: [
          {
            id: 12,
            source_type: 'xtream',
            name: 'Provider',
            config: {},
            created_at: 1000,
          },
        ],
      });

      await useAppStore.getState().refreshSource(12);
      expect(useAppStore.getState().importMessage).toBe(
        'Refreshed 99 catalog items.'
      );
    });
  });

  describe('deleteSource', () => {
    const oldChannel = {
      id: 1,
      source_id: 1,
      name: 'Old Channel',
      group_name: 'Sports',
      logo: null,
      tvg_id: null,
      tvg_name: null,
      stream_url: 'http://old',
      media_kind: 'live' as const,
      is_favorite: false,
    };

    it('moves to the next source when deleting the selected one', async () => {
      const sourcesApi = await getSourcesApi();
      const channelsApi = await getChannelsApi();
      sourcesApi.deleteRegisteredSource.mockResolvedValue(undefined);
      sourcesApi.listRegisteredSources.mockResolvedValue([
        {
          id: 2,
          source_type: 'm3u',
          name: 'Replacement',
          config: {},
          created_at: 2000,
        },
      ]);

      const source = {
        id: 1,
        source_type: 'm3u',
        name: 'Old',
        config: {},
        created_at: 1000,
      };
      useAppStore.setState({
        sources: [source],
        selectedSourceId: 1,
        activeChannel: oldChannel,
      });

      await useAppStore.getState().deleteSource(source);

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBe(2);
      expect(state.activeChannel).toBeNull();
      expect(channelsApi.listSourceChannels).not.toHaveBeenCalled();
      expect(state.importMessage).toBe('Deleted "Old".');
    });

    it('clears the selection when deleting the last source', async () => {
      const sourcesApi = await getSourcesApi();
      sourcesApi.deleteRegisteredSource.mockResolvedValue(undefined);
      sourcesApi.listRegisteredSources.mockResolvedValue([]);

      const source = {
        id: 1,
        source_type: 'm3u',
        name: 'Only',
        config: {},
        created_at: 1000,
      };
      useAppStore.setState({
        sources: [source],
        selectedSourceId: 1,
        activeChannel: oldChannel,
      });

      await useAppStore.getState().deleteSource(source);

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBeNull();
      expect(state.activeChannel).toBeNull();
      expect(state.importMessage).toBe('Deleted "Only".');
    });
  });

  describe('playChannel', () => {
    it('sets activeChannel for web player', async () => {
      const playbackApi = await getPlaybackApi();
      const recentsApi = await getRecentsApi();
      playbackApi.recordRecentChannelPlay.mockResolvedValue(undefined);
      recentsApi.listRecentlyPlayed.mockResolvedValue([]);

      const channel = {
        id: 1,
        source_id: 1,
        name: 'CNN',
        group_name: 'News',
        logo: null,
        tvg_id: null,
        tvg_name: null,
        stream_url: 'http://cnn.m3u8',
        media_kind: 'live' as const,
        is_favorite: false,
      };

      useAppStore.setState({
        recentChannels: [{ channel, played_at: 1 }],
        settings: { ...DEFAULT_SETTINGS, preferred_player: 'web' },
      });

      await useAppStore.getState().playChannel(1);
      expect(useAppStore.getState().activeChannel).toEqual(channel);
    });

    it('still plays when recording watch history fails', async () => {
      const playbackApi = await getPlaybackApi();
      playbackApi.recordRecentChannelPlay.mockRejectedValue(
        'FOREIGN KEY constraint failed'
      );

      const channel = {
        id: 1,
        source_id: 1,
        name: 'CNN',
        group_name: 'News',
        logo: null,
        tvg_id: null,
        tvg_name: null,
        stream_url: 'http://cnn.m3u8',
        media_kind: 'live' as const,
        is_favorite: false,
      };
      const queue = [channel, { ...channel, id: 2, stream_url: 'http://bbc' }];

      useAppStore.setState({
        settings: { ...DEFAULT_SETTINGS, preferred_player: 'web' },
      });

      await useAppStore.getState().playChannelRecord(channel, queue);
      expect(useAppStore.getState()).toMatchObject({
        activeChannel: channel,
        playbackQueue: queue,
        error: null,
      });
    });

    it('opens MPV for mpv player preference', async () => {
      const playbackApi = await getPlaybackApi();
      const recentsApi = await getRecentsApi();
      playbackApi.openExternalWindow.mockResolvedValue(undefined);
      playbackApi.recordRecentChannelPlay.mockResolvedValue(undefined);
      recentsApi.listRecentlyPlayed.mockResolvedValue([]);

      const channel = {
        id: 1,
        source_id: 1,
        name: 'CNN',
        group_name: 'News',
        logo: null,
        tvg_id: null,
        tvg_name: null,
        stream_url: 'http://cnn.m3u8',
        media_kind: 'live' as const,
        is_favorite: false,
      };

      useAppStore.setState({
        recentChannels: [{ channel, played_at: 1 }],
        settings: { ...DEFAULT_SETTINGS, preferred_player: 'mpv' },
      });

      await useAppStore.getState().playChannel(1);
      expect(playbackApi.openExternalWindow).toHaveBeenCalledWith(
        'http://cnn.m3u8',
        { title: 'CNN' }
      );
      expect(useAppStore.getState().activeChannel).toBeNull();
    });

    it('sets error for unknown channelId', async () => {
      useAppStore.setState({ recentChannels: [] });
      await useAppStore.getState().playChannel(999);
      expect(useAppStore.getState().error).toContain('channel 999 not found');
    });
  });

  describe('setVolume', () => {
    it('updates volume in playback state optimistically', async () => {
      const playbackApi = await getPlaybackApi();
      playbackApi.setVolume.mockResolvedValue(undefined);

      useAppStore.setState({
        playback: {
          state: 'playing',
          attached_hwnd: null,
          embedded_surface_hwnd: null,
          current_url: 'http://test',
          backend: 'mpv',
          last_error: null,
          volume: 50,
          fullscreen: false,
          render_mode: 'external_window',
        },
      });

      await useAppStore.getState().setVolume(75);
      expect(useAppStore.getState().playback?.volume).toBe(75);
    });
  });

  describe('logout', () => {
    it('resets selection state and clears localStorage', () => {
      useAppStore.setState({
        selectedSourceId: 5,
        activeChannel: {
          id: 1,
          source_id: 1,
          name: 'Ch1',
          group_name: 'A',
          logo: null,
          tvg_id: null,
          tvg_name: null,
          stream_url: 'http://test',
          media_kind: 'live',
          is_favorite: false,
        },
      });

      window.localStorage.setItem('silkcast:lastSelectedSourceId', '5');
      useAppStore.getState().logout();

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBeNull();
      expect(state.hasPersistedSourceSelection).toBe(false);
      expect(state.activeChannel).toBeNull();
      expect(
        window.localStorage.getItem('silkcast:lastSelectedSourceId')
      ).toBeNull();
    });
  });

  describe('saveSettings', () => {
    it('persists current settings via API and reloads', async () => {
      const settingsApi = await getSettingsApi();
      const newSettings = {
        ...DEFAULT_SETTINGS,
        preferred_player: 'mpv' as const,
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
