import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../test/renderWithRouter';
import { SeriesPage } from './SeriesPage';
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
    selectedSourceId: 77,
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

describe('SeriesPage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('renders the heading', async () => {
    renderWithRouter(<SeriesPage />, {
      initialEntries: ['/dashboard/series'],
    });
    expect(screen.getByRole('heading', { name: 'Series' })).toBeInTheDocument();
    await screen.findByText(
      'No series matched these filters for the selected source.'
    );
  });

  it('renders series filter controls', async () => {
    renderWithRouter(<SeriesPage />, {
      initialEntries: ['/dashboard/series'],
    });

    expect(screen.getByPlaceholderText('Search series')).toBeInTheDocument();
    expect(screen.getByLabelText('Favorites only')).toBeInTheDocument();
    await screen.findByText(
      'No series matched these filters for the selected source.'
    );
  });

  it('loads series groups and channels for the selected source', async () => {
    renderWithRouter(<SeriesPage />, {
      initialEntries: ['/dashboard/series'],
    });

    await waitFor(() => {
      expect(listSourceGroups).toHaveBeenCalledWith(77, 'series');
      expect(listSourceChannels).toHaveBeenCalledWith({
        sourceId: 77,
        mediaKind: 'series',
        groupName: null,
        query: null,
        favoritesOnly: false,
      });
      expect(subscribeBackendEvents).toHaveBeenCalledTimes(1);
    });
  });

  it('shows empty-state copy when no series matches', async () => {
    renderWithRouter(<SeriesPage />, {
      initialEntries: ['/dashboard/series'],
    });

    expect(
      await screen.findByText(
        'No series matched these filters for the selected source.'
      )
    ).toBeInTheDocument();
  });
});
