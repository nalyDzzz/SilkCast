import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../test/renderWithRouter';
import { LivePage } from './LivePage';
import { useAppStore } from '../store/appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS } from '../components/app/types';
import { listSourceChannels } from '../lib/api/channelsApi';
import { subscribeBackendEvents } from '../lib/api/eventsApi';
import { listSourceGroups } from '../lib/api/sourcesApi';

vi.mock('../lib/api/channelsApi', () => ({
  listSourceChannels: vi.fn(() => Promise.resolve([])),
  setChannelFavoriteState: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/api/sourcesApi', () => ({
  listSourceGroups: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../lib/api/eventsApi', () => ({
  subscribeBackendEvents: vi.fn(() => Promise.resolve(() => {})),
}));

function resetStore(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    sources: [],
    selectedSourceId: 12,
    hasPersistedSourceSelection: false,
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
    loadSources: vi.fn(() => Promise.resolve()),
    loadSettings: vi.fn(() => Promise.resolve()),
    loadRecents: vi.fn(() => Promise.resolve()),
    loadPlaybackStatus: vi.fn(() => Promise.resolve()),
    setPlayback: vi.fn(),
    playChannelRecord: vi.fn(() => Promise.resolve()),
    ...overrides,
  });
}

describe('LivePage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('renders the heading', async () => {
    renderWithRouter(<LivePage />, {
      initialEntries: ['/dashboard/live'],
    });

    expect(
      screen.getByRole('heading', { name: 'Live TV' })
    ).toBeInTheDocument();
    await screen.findByText(
      'No channels matched these filters for the selected source.'
    );
  });

  it('renders live tv filter controls', async () => {
    renderWithRouter(<LivePage />, {
      initialEntries: ['/dashboard/live'],
    });

    expect(screen.getByPlaceholderText('Search channels')).toBeInTheDocument();
    expect(screen.getByLabelText('Favorites only')).toBeInTheDocument();
    await screen.findByText(
      'No channels matched these filters for the selected source.'
    );
  });

  it('loads live groups and channels for the selected source', async () => {
    const loadRecents = vi.fn(() => Promise.resolve());
    const loadPlaybackStatus = vi.fn(() => Promise.resolve());

    resetStore({
      loadRecents,
      loadPlaybackStatus,
    });

    renderWithRouter(<LivePage />, {
      initialEntries: ['/dashboard/live'],
    });

    await waitFor(() => {
      expect(listSourceGroups).toHaveBeenCalledWith(12, 'live');
      expect(listSourceChannels).toHaveBeenCalledWith({
        sourceId: 12,
        mediaKind: 'live',
        groupName: null,
        query: null,
        favoritesOnly: false,
      });
      expect(loadRecents).toHaveBeenCalledTimes(1);
      expect(loadPlaybackStatus).toHaveBeenCalledTimes(1);
      expect(subscribeBackendEvents).toHaveBeenCalledTimes(1);
    });
  });

  it('shows empty-state copy when no channels match', async () => {
    renderWithRouter(<LivePage />, {
      initialEntries: ['/dashboard/live'],
    });

    expect(
      await screen.findByText(
        'No channels matched these filters for the selected source.'
      )
    ).toBeInTheDocument();
  });
});
