import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useAppStore } from './appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS } from '../components/app/types';

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
    groups: [],
    selectedGroup: ALL_GROUPS,
    channels: [],
    recentChannels: [],
    activeChannel: null,
    playback: null,
    settings: DEFAULT_SETTINGS,
    theme: 'light',
    m3uName: '',
    m3uLocation: '',
    searchQuery: '',
    favoritesOnly: false,
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
      expect(state.groups).toEqual([]);
      expect(state.selectedGroup).toBe(ALL_GROUPS);
      expect(state.channels).toEqual([]);
      expect(state.recentChannels).toEqual([]);
      expect(state.activeChannel).toBeNull();
      expect(state.playback).toBeNull();
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
      expect(state.theme).toBe('light');
      expect(state.searchQuery).toBe('');
      expect(state.favoritesOnly).toBe(false);
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

    it('setSearchQuery updates searchQuery', () => {
      useAppStore.getState().setSearchQuery('news');
      expect(useAppStore.getState().searchQuery).toBe('news');
    });

    it('setFavoritesOnly updates favoritesOnly', () => {
      useAppStore.getState().setFavoritesOnly(true);
      expect(useAppStore.getState().favoritesOnly).toBe(true);
    });

    it('setSelectedGroup updates selectedGroup', () => {
      useAppStore.getState().setSelectedGroup('Sports');
      expect(useAppStore.getState().selectedGroup).toBe('Sports');
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

    it('clearSourceLists clears groups and channels', () => {
      useAppStore.setState({
        groups: [{ name: 'A', channel_count: 5 }],
        channels: [
          {
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
        ],
      });

      useAppStore.getState().clearSourceLists();
      expect(useAppStore.getState().groups).toEqual([]);
      expect(useAppStore.getState().channels).toEqual([]);
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

  describe('loadGroups', () => {
    it('sets groups from API response', async () => {
      const api = await getSourcesApi();
      api.listSourceGroups.mockResolvedValue([
        { name: 'Sports', channel_count: 20 },
        { name: 'News', channel_count: 10 },
      ]);

      await useAppStore.getState().loadGroups(1, 'live');
      expect(useAppStore.getState().groups).toEqual([
        { name: 'Sports', channel_count: 20 },
        { name: 'News', channel_count: 10 },
      ]);
    });
  });

  describe('loadChannels', () => {
    it('fetches channels with current filters', async () => {
      const api = await getChannelsApi();
      const channels = [
        {
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
        },
      ];
      api.listSourceChannels.mockResolvedValue(channels);

      useAppStore.setState({ selectedGroup: ALL_GROUPS, searchQuery: '' });
      await useAppStore.getState().loadChannels(1, 'live');

      expect(api.listSourceChannels).toHaveBeenCalledWith({
        sourceId: 1,
        mediaKind: 'live',
        groupName: null,
        query: null,
        favoritesOnly: false,
      });
      expect(useAppStore.getState().channels).toEqual(channels);
    });

    it('passes group and search when set', async () => {
      const api = await getChannelsApi();
      api.listSourceChannels.mockResolvedValue([]);

      useAppStore.setState({
        selectedGroup: 'News',
        searchQuery: 'cnn',
        favoritesOnly: true,
      });
      await useAppStore.getState().loadChannels(1, 'live');

      expect(api.listSourceChannels).toHaveBeenCalledWith({
        sourceId: 1,
        mediaKind: 'live',
        groupName: 'News',
        query: 'cnn',
        favoritesOnly: true,
      });
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
      sourcesApi.listSourceGroups.mockResolvedValue([]);
      const channelsApi = await getChannelsApi();
      channelsApi.listSourceChannels.mockResolvedValue([]);

      useAppStore.setState({ m3uName: 'New', m3uLocation: 'http://new.m3u' });
      await useAppStore.getState().addM3uSource('New', 'http://new.m3u');

      const state = useAppStore.getState();
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
      sourcesApi.listSourceGroups.mockResolvedValue([]);
      const channelsApi = await getChannelsApi();
      channelsApi.listSourceChannels.mockResolvedValue([]);

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
    it('refreshes selected source and reloads filtered groups/channels', async () => {
      const sourcesApi = await getSourcesApi();
      const channelsApi = await getChannelsApi();
      sourcesApi.refreshRegisteredSource.mockResolvedValue({
        source_id: 10,
        imported_channels: 7,
      });
      sourcesApi.listSourceGroups.mockResolvedValue([]);
      channelsApi.listSourceChannels.mockResolvedValue([]);

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
      await useAppStore.getState().refreshSource(10, 'live');

      expect(sourcesApi.refreshRegisteredSource).toHaveBeenCalledWith(10);
      expect(sourcesApi.listSourceGroups).toHaveBeenCalledWith(10, 'live');
      expect(channelsApi.listSourceChannels).toHaveBeenCalledWith({
        sourceId: 10,
        mediaKind: 'live',
        groupName: null,
        query: null,
        favoritesOnly: false,
      });
      expect(useAppStore.getState().importMessage).toBe(
        'Refreshed 7 channels.'
      );
    });

    it('does not reload groups/channels when source is not selected', async () => {
      const sourcesApi = await getSourcesApi();
      const channelsApi = await getChannelsApi();
      sourcesApi.refreshRegisteredSource.mockResolvedValue({
        source_id: 10,
        imported_channels: 5,
      });

      useAppStore.setState({ selectedSourceId: 5 });
      await useAppStore.getState().refreshSource(10, 'movie');

      expect(sourcesApi.refreshRegisteredSource).toHaveBeenCalledWith(10);
      expect(sourcesApi.listSourceGroups).not.toHaveBeenCalled();
      expect(channelsApi.listSourceChannels).not.toHaveBeenCalled();
    });

    it('uses xtream messaging for xtream sources', async () => {
      const sourcesApi = await getSourcesApi();
      const channelsApi = await getChannelsApi();
      sourcesApi.refreshRegisteredSource.mockResolvedValue({
        source_id: 12,
        imported_channels: 99,
      });
      sourcesApi.listSourceGroups.mockResolvedValue([]);
      channelsApi.listSourceChannels.mockResolvedValue([]);

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

      await useAppStore.getState().refreshSource(12, 'series');
      expect(useAppStore.getState().importMessage).toBe(
        'Refreshed 99 catalog items.'
      );
    });
  });

  describe('deleteSource', () => {
    it('reloads source data when deleting the selected source', async () => {
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
      sourcesApi.listSourceGroups.mockResolvedValue([
        { name: 'All', channel_count: 1 },
      ]);
      channelsApi.listSourceChannels.mockResolvedValue([
        {
          id: 2,
          source_id: 2,
          name: 'Backup',
          group_name: 'All',
          logo: null,
          tvg_id: null,
          tvg_name: null,
          stream_url: 'http://backup',
          media_kind: 'live' as const,
          is_favorite: false,
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
        selectedGroup: 'Sports',
        groups: [{ name: 'Sports', channel_count: 4 }],
        channels: [
          {
            id: 1,
            source_id: 1,
            name: 'Old Channel',
            group_name: 'Sports',
            logo: null,
            tvg_id: null,
            tvg_name: null,
            stream_url: 'http://old',
            media_kind: 'live',
            is_favorite: false,
          },
        ],
        activeChannel: {
          id: 1,
          source_id: 1,
          name: 'Old Channel',
          group_name: 'Sports',
          logo: null,
          tvg_id: null,
          tvg_name: null,
          stream_url: 'http://old',
          media_kind: 'live',
          is_favorite: false,
        },
      });

      await useAppStore.getState().deleteSource(source);

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBe(2);
      expect(state.selectedGroup).toBe(ALL_GROUPS);
      expect(state.groups).toEqual([{ name: 'All', channel_count: 1 }]);
      expect(state.channels).toEqual([
        {
          id: 2,
          source_id: 2,
          name: 'Backup',
          group_name: 'All',
          logo: null,
          tvg_id: null,
          tvg_name: null,
          stream_url: 'http://backup',
          media_kind: 'live',
          is_favorite: false,
        },
      ]);
      expect(state.activeChannel).toBeNull();
      expect(sourcesApi.listSourceGroups).toHaveBeenCalledWith(2, null);
      expect(channelsApi.listSourceChannels).toHaveBeenCalledWith({
        sourceId: 2,
        mediaKind: null,
        groupName: null,
        query: null,
        favoritesOnly: false,
      });
      expect(state.importMessage).toBe('Deleted "Old".');
    });

    it('clears source data when deleting the last selected source', async () => {
      const sourcesApi = await getSourcesApi();
      const channelsApi = await getChannelsApi();
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
        selectedGroup: 'News',
        groups: [{ name: 'News', channel_count: 2 }],
        channels: [
          {
            id: 1,
            source_id: 1,
            name: 'Only Channel',
            group_name: 'News',
            logo: null,
            tvg_id: null,
            tvg_name: null,
            stream_url: 'http://only',
            media_kind: 'live',
            is_favorite: false,
          },
        ],
        activeChannel: {
          id: 1,
          source_id: 1,
          name: 'Only Channel',
          group_name: 'News',
          logo: null,
          tvg_id: null,
          tvg_name: null,
          stream_url: 'http://only',
          media_kind: 'live',
          is_favorite: false,
        },
      });

      await useAppStore.getState().deleteSource(source);

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBeNull();
      expect(state.selectedGroup).toBe(ALL_GROUPS);
      expect(state.groups).toEqual([]);
      expect(state.channels).toEqual([]);
      expect(state.activeChannel).toBeNull();
      expect(channelsApi.listSourceChannels).not.toHaveBeenCalled();
      expect(sourcesApi.listSourceGroups).not.toHaveBeenCalled();
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
        channels: [channel],
        settings: { ...DEFAULT_SETTINGS, preferred_player: 'web' },
      });

      await useAppStore.getState().playChannel(1);
      expect(useAppStore.getState().activeChannel).toEqual(channel);
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
        channels: [channel],
        settings: { ...DEFAULT_SETTINGS, preferred_player: 'mpv' },
      });

      await useAppStore.getState().playChannel(1);
      expect(playbackApi.openExternalWindow).toHaveBeenCalledWith(
        'http://cnn.m3u8'
      );
      expect(useAppStore.getState().activeChannel).toBeNull();
    });

    it('sets error for unknown channelId', async () => {
      useAppStore.setState({ channels: [], recentChannels: [] });
      await useAppStore.getState().playChannel(999);
      expect(useAppStore.getState().error).toContain('channel 999 not found');
    });
  });

  describe('toggleFavorite', () => {
    it('toggles favorite state and reloads channels', async () => {
      const channelsApi = await getChannelsApi();
      const recentsApi = await getRecentsApi();
      channelsApi.setChannelFavoriteState.mockResolvedValue(undefined);
      channelsApi.listSourceChannels.mockResolvedValue([]);
      recentsApi.listRecentlyPlayed.mockResolvedValue([]);

      const channel = {
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
      };

      useAppStore.setState({ selectedSourceId: 1 });
      await useAppStore.getState().toggleFavorite(channel);
      expect(channelsApi.setChannelFavoriteState).toHaveBeenCalledWith(1, true);
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
        selectedGroup: 'Sports',
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
        groups: [{ name: 'Sports', channel_count: 10 }],
        channels: [],
      });

      window.localStorage.setItem('silkcast:lastSelectedSourceId', '5');
      useAppStore.getState().logout();

      const state = useAppStore.getState();
      expect(state.selectedSourceId).toBeNull();
      expect(state.hasPersistedSourceSelection).toBe(false);
      expect(state.selectedGroup).toBe(ALL_GROUPS);
      expect(state.activeChannel).toBeNull();
      expect(state.groups).toEqual([]);
      expect(state.channels).toEqual([]);
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
