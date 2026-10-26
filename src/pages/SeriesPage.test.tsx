import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import { renderWithRouter } from '../test/renderWithRouter';
import { SeriesPage } from './SeriesPage';
import { useAppStore } from '../store/appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS } from '../components/app/types';
import { listSourceChannels } from '../lib/api/channelsApi';
import { subscribeBackendEvents } from '../lib/api/eventsApi';
import { listSeriesEpisodes } from '../lib/api/seriesApi';
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

vi.mock('../lib/api/seriesApi', () => ({
  listSeriesEpisodes: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../components/movies/VirtualizedMovieGrid', () => ({
  VirtualizedMovieGrid: ({
    items,
    getItemKey,
    renderItem,
  }: {
    items: unknown[];
    getItemKey: (item: unknown) => string | number;
    renderItem: (item: unknown) => ReactNode;
  }) => (
    <div data-testid="virtualized-grid">
      {items.map((item) => (
        <div key={String(getItemKey(item))}>{renderItem(item)}</div>
      ))}
    </div>
  ),
}));

const DEFAULT_SERIES = {
  id: 901,
  source_id: 77,
  name: 'SilkCast Show',
  group_name: 'Drama',
  logo: null,
  tvg_id: '901',
  tvg_name: 'SilkCast Show',
  stream_url: 'https://provider.example/series/alice/secret/901.mp4',
  media_kind: 'series' as const,
  is_favorite: false,
};

const DEFAULT_EPISODES = [
  {
    episode_id: '5551',
    season_number: 1,
    episode_number: 1,
    title: 'Pilot',
    stream_url: 'https://provider.example/series/alice/secret/5551.mp4',
  },
];

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
    const loadRecents = vi.fn(() => Promise.resolve());

    resetStore({
      loadRecents,
    });

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
      expect(loadRecents).not.toHaveBeenCalled();
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

  it('opens the episode list instead of playing immediately for xtream sources', async () => {
    const user = userEvent.setup();
    const playChannelRecord = vi.fn(() => Promise.resolve());

    vi.mocked(listSourceChannels).mockResolvedValueOnce([DEFAULT_SERIES]);
    vi.mocked(listSeriesEpisodes).mockResolvedValueOnce(DEFAULT_EPISODES);

    resetStore({
      sources: [
        {
          id: 77,
          source_type: 'xtream',
          name: 'Xtream Source',
          config: {},
          created_at: 1000,
        },
      ],
      playChannelRecord,
    });

    renderWithRouter(<SeriesPage />, {
      initialEntries: ['/dashboard/series'],
    });

    await user.click(await screen.findByText('SilkCast Show'));

    await waitFor(() => {
      expect(listSeriesEpisodes).toHaveBeenCalledWith(901);
      expect(playChannelRecord).not.toHaveBeenCalled();
    });
    expect(await screen.findByText('Pilot')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'All series' })
    ).toBeInTheDocument();
  });

  it('keeps the open series when returning to the page', async () => {
    const user = userEvent.setup();

    vi.mocked(listSourceChannels).mockResolvedValue([DEFAULT_SERIES]);
    vi.mocked(listSeriesEpisodes).mockResolvedValueOnce(DEFAULT_EPISODES);

    resetStore({
      sources: [
        {
          id: 77,
          source_type: 'xtream',
          name: 'Xtream Source',
          config: {},
          created_at: 1000,
        },
      ],
    });

    const { unmount } = renderWithRouter(<SeriesPage />, {
      initialEntries: ['/dashboard/series'],
    });
    await user.click(await screen.findByText('SilkCast Show'));
    expect(await screen.findByText('Pilot')).toBeInTheDocument();
    unmount();

    renderWithRouter(<SeriesPage />, {
      initialEntries: ['/dashboard/series'],
    });

    expect(await screen.findByText('Pilot')).toBeInTheDocument();
    // Episodes come from the cache instead of a second provider request.
    expect(listSeriesEpisodes).toHaveBeenCalledTimes(1);
    vi.mocked(listSourceChannels).mockResolvedValue([]);
  });

  it('plays a selected episode from the episode list', async () => {
    const user = userEvent.setup();
    const playChannelRecord = vi.fn(() => Promise.resolve());

    vi.mocked(listSourceChannels).mockResolvedValueOnce([DEFAULT_SERIES]);
    vi.mocked(listSeriesEpisodes).mockResolvedValueOnce(DEFAULT_EPISODES);

    resetStore({
      sources: [
        {
          id: 77,
          source_type: 'xtream',
          name: 'Xtream Source',
          config: {},
          created_at: 1000,
        },
      ],
      settings: { ...DEFAULT_SETTINGS, preferred_player: 'web' },
      playChannelRecord,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard/series']}>
        <Routes>
          <Route path="/dashboard/series" element={<SeriesPage />} />
          <Route path="/dashboard/player" element={<p>Player Screen</p>} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByText('SilkCast Show'));
    await user.click(
      await screen.findByRole('button', { name: 'Play S01E01 Pilot' })
    );

    await waitFor(() => {
      expect(playChannelRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 901,
          stream_url: 'https://provider.example/series/alice/secret/5551.mp4',
          name: 'S01E01 · Pilot',
          group_name: 'SilkCast Show',
        }),
        // The full episode list becomes the player's next/previous queue.
        [
          expect.objectContaining({
            stream_url: 'https://provider.example/series/alice/secret/5551.mp4',
          }),
        ]
      );
    });
    expect(await screen.findByText('Player Screen')).toBeInTheDocument();
  });

  it('keeps direct playback behavior for non-xtream series sources', async () => {
    const user = userEvent.setup();
    const playChannelRecord = vi.fn(() => Promise.resolve());

    vi.mocked(listSourceChannels).mockResolvedValueOnce([DEFAULT_SERIES]);

    resetStore({
      sources: [
        {
          id: 77,
          source_type: 'm3u',
          name: 'M3U Source',
          config: {},
          created_at: 1000,
        },
      ],
      playChannelRecord,
    });

    renderWithRouter(<SeriesPage />, {
      initialEntries: ['/dashboard/series'],
    });

    await user.click(await screen.findByText('SilkCast Show'));

    await waitFor(() => {
      expect(playChannelRecord).toHaveBeenCalledWith(DEFAULT_SERIES, undefined);
      expect(listSeriesEpisodes).not.toHaveBeenCalled();
    });
  });
});
