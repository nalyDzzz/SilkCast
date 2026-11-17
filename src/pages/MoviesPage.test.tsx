import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderWithRouter } from '../test/renderWithRouter';
import { mediaDetails } from '../test/mediaDetails';
import { MoviesPage } from './MoviesPage';
import { useAppStore } from '../store/appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS, type ChannelRecord } from '../components/app/types';
import { listRelatedItems, listSourceChannels, setChannelFavoriteState } from '../lib/api/channelsApi';
import { subscribeBackendEvents } from '../lib/api/eventsApi';
import { getMediaDetails } from '../lib/api/mediaDetailsApi';
import { listSourceGroups } from '../lib/api/sourcesApi';
import { saveResumePosition } from '../lib/player/playerStorage';
import { resumeKeyFor } from '../components/player/hooks/useResumeTracking';

vi.mock('../lib/api/channelsApi', () => ({
  listSourceChannels: vi.fn(() => Promise.resolve([])),
  listRelatedItems: vi.fn(() => Promise.resolve([])),
  setChannelFavoriteState: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/api/sourcesApi', () => ({
  listSourceGroups: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../lib/api/eventsApi', () => ({
  subscribeBackendEvents: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('../lib/api/mediaDetailsApi', () => ({
  getMediaDetails: vi.fn(() => Promise.resolve(null)),
  openTrailer: vi.fn(() => Promise.resolve()),
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

const MOVIE: ChannelRecord = {
  id: 501,
  source_id: 42,
  name: 'EN - Low Tide Motel (1997)',
  group_name: 'Classics',
  logo: null,
  stream_url: 'https://provider.example/movie/alice/secret/202.mkv',
  media_kind: 'movie',
  is_favorite: false,
};

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
    vi.mocked(listSourceChannels).mockResolvedValue([]);
    vi.mocked(getMediaDetails).mockResolvedValue(null);
    vi.mocked(listRelatedItems).mockResolvedValue([]);
  });

  it('renders the heading', async () => {
    renderWithRouter(<MoviesPage />, {
      initialEntries: ['/dashboard/movies'],
    });
    expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
    await screen.findByText(
      'No movies match these filters.'
    );
  });

  it('renders movies filter controls', async () => {
    renderWithRouter(<MoviesPage />, {
      initialEntries: ['/dashboard/movies'],
    });

    expect(screen.getByPlaceholderText('Search movies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeInTheDocument();
    await screen.findByText(
      'No movies match these filters.'
    );
  });

  it('loads movie groups and channels for the selected source', async () => {
    const loadRecents = vi.fn(() => Promise.resolve());

    resetStore({
      loadRecents,
    });

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
      expect(loadRecents).not.toHaveBeenCalled();
      expect(subscribeBackendEvents).toHaveBeenCalledTimes(1);
    });
  });

  it('opens a movie\'s details from its poster and plays from there', async () => {
    const user = userEvent.setup();
    const playChannelRecord = vi.fn(() => Promise.resolve());
    vi.mocked(listSourceChannels).mockResolvedValue([MOVIE]);
    vi.mocked(getMediaDetails).mockResolvedValue(
      mediaDetails({
        plot: 'A motel clerk keeps a ledger.',
        genres: ['Drama', 'Crime'],
        runtime_minutes: 108,
        rating: 7.4,
        directors: ['Ines Calder'],
        cast: ['June Abara', 'Theo Marsh'],
      })
    );
    resetStore({ playChannelRecord });

    renderWithRouter(<MoviesPage />, { initialEntries: ['/dashboard/movies'] });
    await user.click(await screen.findByRole('button', { name: 'Open Low Tide Motel' }));

    expect(await screen.findByRole('heading', { name: 'Low Tide Motel' })).toBeInTheDocument();
    expect(await screen.findByText('A motel clerk keeps a ledger.')).toBeInTheDocument();
    expect(screen.getByText('Drama / Crime')).toBeInTheDocument();
    expect(screen.getByText('1h 48m')).toBeInTheDocument();
    expect(screen.getByText('June Abara, Theo Marsh')).toBeInTheDocument();
    expect(getMediaDetails).toHaveBeenCalledWith(501);
    expect(playChannelRecord).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(playChannelRecord).toHaveBeenCalledWith(MOVIE, undefined);

    await user.click(screen.getByRole('button', { name: 'All movies' }));
    expect(await screen.findByRole('button', { name: 'Open Low Tide Motel' })).toBeInTheDocument();
  });

  it('plays straight from the poster\'s play button', async () => {
    const user = userEvent.setup();
    const playChannelRecord = vi.fn(() => Promise.resolve());
    vi.mocked(listSourceChannels).mockResolvedValue([MOVIE]);
    resetStore({ playChannelRecord });

    renderWithRouter(<MoviesPage />, { initialEntries: ['/dashboard/movies'] });
    await user.click(await screen.findByRole('button', { name: 'Play Low Tide Motel' }));

    expect(playChannelRecord).toHaveBeenCalledWith(MOVIE, undefined);
    expect(getMediaDetails).not.toHaveBeenCalled();
  });

  it('lists more from the group and opens one of them', async () => {
    const user = userEvent.setup();
    const neighbour: ChannelRecord = { ...MOVIE, id: 502, name: 'EN - Northbound (2024)' };
    vi.mocked(listSourceChannels).mockResolvedValue([MOVIE]);
    vi.mocked(listRelatedItems).mockResolvedValue([
      { ...MOVIE, id: 503, name: '##### CLASSICS #####' },
      neighbour,
    ]);

    renderWithRouter(<MoviesPage />, { initialEntries: ['/dashboard/movies'] });
    await user.click(await screen.findByRole('button', { name: 'Open Low Tide Motel' }));

    const rail = await screen.findByRole('region', { name: 'More in Classics' });
    expect(listRelatedItems).toHaveBeenCalledWith(501, expect.any(Number));
    expect(rail).not.toHaveTextContent('CLASSICS');
    await user.click(await screen.findByRole('button', { name: 'Open Northbound' }));

    expect(await screen.findByRole('heading', { name: 'Northbound' })).toBeInTheDocument();
    expect(getMediaDetails).toHaveBeenLastCalledWith(502);
  });

  it('offers resume, a fresh start, and favoriting on the details page', async () => {
    const user = userEvent.setup();
    const playChannelRecord = vi.fn(() => Promise.resolve());
    vi.mocked(listSourceChannels).mockResolvedValue([MOVIE]);
    saveResumePosition(resumeKeyFor(MOVIE), 3564, 6480);
    resetStore({ playChannelRecord });

    renderWithRouter(<MoviesPage />, { initialEntries: ['/dashboard/movies'] });
    await user.click(await screen.findByRole('button', { name: 'Open Low Tide Motel' }));

    expect(await screen.findByRole('button', { name: 'Resume · 49 min left' })).toBeInTheDocument();
    expect(screen.getByText('Stopped at 59:24 of 1:48:00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Low Tide Motel to favorites' }));
    expect(setChannelFavoriteState).toHaveBeenCalledWith(501, true);
    expect(
      await screen.findByRole('button', { name: 'Remove Low Tide Motel from favorites' })
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Play from start' }));
    expect(playChannelRecord).toHaveBeenCalledWith({ ...MOVIE, is_favorite: true }, undefined);
    expect(screen.queryByText(/Stopped at/)).not.toBeInTheDocument();
  });

  it('shows empty-state copy when no movies match', async () => {
    renderWithRouter(<MoviesPage />, {
      initialEntries: ['/dashboard/movies'],
    });

    expect(
      await screen.findByText(
        'No movies match these filters.'
      )
    ).toBeInTheDocument();
  });
});
