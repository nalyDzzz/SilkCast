import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../test/renderWithRouter';
import { MoviesPage } from './MoviesPage';
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
    selectedSourceId: 42,
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

describe('MoviesPage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('renders the heading', async () => {
    renderWithRouter(<MoviesPage />, {
      initialEntries: ['/dashboard/movies'],
    });
    expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
    await screen.findByText(
      'No movies matched these filters for the selected source.'
    );
  });

  it('renders movies filter controls', async () => {
    renderWithRouter(<MoviesPage />, {
      initialEntries: ['/dashboard/movies'],
    });

    expect(screen.getByPlaceholderText('Search movies')).toBeInTheDocument();
    expect(screen.getByLabelText('Favorites only')).toBeInTheDocument();
    await screen.findByText(
      'No movies matched these filters for the selected source.'
    );
  });

  it('loads movie groups and channels for the selected source', async () => {
    renderWithRouter(<MoviesPage />, {
      initialEntries: ['/dashboard/movies'],
    });

    await waitFor(() => {
      expect(listSourceGroups).toHaveBeenCalledWith(42, 'movie');
      expect(listSourceChannels).toHaveBeenCalledWith({
        sourceId: 42,
        mediaKind: 'movie',
        groupName: null,
        query: null,
        favoritesOnly: false,
      });
      expect(subscribeBackendEvents).toHaveBeenCalledTimes(1);
    });
  });

  it('shows empty-state copy when no movies match', async () => {
    renderWithRouter(<MoviesPage />, {
      initialEntries: ['/dashboard/movies'],
    });

    expect(
      await screen.findByText(
        'No movies matched these filters for the selected source.'
      )
    ).toBeInTheDocument();
  });
});
