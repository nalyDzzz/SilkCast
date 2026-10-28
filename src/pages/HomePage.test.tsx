import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter } from '../test/renderWithRouter';
import { HomePage } from './HomePage';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useAppStore } from '../store/appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS } from '../components/app/types';
import * as sourcesApi from '../lib/api/sourcesApi';

vi.mock('../lib/api/sourcesApi', () => ({
  listRegisteredSources: vi.fn(() => Promise.resolve([])),
  listSourceGroups: vi.fn(() => Promise.resolve([])),
  addM3uSource: vi.fn(),
  addXtreamSource: vi.fn(),
  updateRegisteredSource: vi.fn(),
  refreshRegisteredSource: vi.fn(),
  deleteRegisteredSource: vi.fn(),
}));

vi.mock('../lib/api/channelsApi', () => ({
  listSourceChannels: vi.fn(() => Promise.resolve([])),
  setChannelFavoriteState: vi.fn(() => Promise.resolve(undefined)),
}));

function resetStore(overrides: Record<string, unknown> = {}) {
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
    m3uName: '',
    m3uLocation: '',
    searchQuery: '',
    favoritesOnly: false,
    error: null,
    loading: false,
    importMessage: null,
    ...overrides,
  });
}

async function renderHomePage() {
  renderWithRouter(<HomePage />);
  await waitFor(() => {
    expect(sourcesApi.listRegisteredSources).toHaveBeenCalledTimes(1);
  });
}

function getSourceRow(sourceName: string) {
  const label = screen.getByText(sourceName);
  const row = label.closest('[role="listitem"]');
  if (!row) {
    throw new Error(`source row not found for ${sourceName}`);
  }
  return row;
}

describe('HomePage', () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.hasPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
        configurable: true,
        value: () => false,
      });
    }

    if (!HTMLElement.prototype.setPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        configurable: true,
        value: () => {},
      });
    }

    if (!HTMLElement.prototype.releasePointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
        configurable: true,
        value: () => {},
      });
    }

    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: () => {},
      });
    }
  });

  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(sourcesApi.listRegisteredSources).mockResolvedValue([]);
    vi.mocked(sourcesApi.updateRegisteredSource).mockResolvedValue({
      source_id: 1,
      imported_channels: 0,
    });
  });

  it('renders the SilkCast heading', async () => {
    await renderHomePage();
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeInTheDocument();
  });

  it('renders the import description text', async () => {
    await renderHomePage();
    expect(
      screen.getByText(/Connect an Xtream provider or import an M3U playlist/)
    ).toBeInTheDocument();
  });

  it('renders Select Source card', async () => {
    await renderHomePage();
    expect(screen.getByText('Select Source')).toBeInTheDocument();
  });

  it('renders Import Source card', async () => {
    await renderHomePage();
    expect(screen.getByText('Import Source')).toBeInTheDocument();
  });

  it("shows 'No sources imported yet.' when no sources", async () => {
    await renderHomePage();
    expect(screen.getByText('No sources imported yet.')).toBeInTheDocument();
  });

  it('renders import form inputs', async () => {
    await renderHomePage();
    expect(screen.getByPlaceholderText('Playlist name')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('https://... or /path/to/file.m3u')
    ).toBeInTheDocument();
  });

  it('shows import message when present', async () => {
    resetStore({ importMessage: 'Imported 50 channels.' });
    await renderHomePage();
    expect(screen.getByText('Imported 50 channels.')).toBeInTheDocument();
  });

  it('shows error message when present', async () => {
    resetStore({ error: 'Failed to import' });
    await renderHomePage();
    expect(screen.getByText('Failed to import')).toBeInTheDocument();
  });

  it('updates store when typing in name input', async () => {
    const user = userEvent.setup();
    await renderHomePage();
    const nameInput = screen.getByPlaceholderText('Playlist name');
    await user.type(nameInput, 'Test');
    expect(useAppStore.getState().m3uName).toBe('Test');
  });

  it('updates store when typing in location input', async () => {
    const user = userEvent.setup();
    await renderHomePage();
    const locationInput = screen.getByPlaceholderText(
      'https://... or /path/to/file.m3u'
    );
    await user.type(locationInput, 'http://example.com/list.m3u');
    expect(useAppStore.getState().m3uLocation).toBe(
      'http://example.com/list.m3u'
    );
  });

  it('shows loading state on import button', async () => {
    resetStore({ loading: true });
    await renderHomePage();
    expect(screen.getByRole('button', { name: 'Importing...' })).toBeDisabled();
  });

  it('shows xtream inputs when toggled', async () => {
    const user = userEvent.setup();
    await renderHomePage();

    await user.click(screen.getByRole('button', { name: 'Xtream Provider' }));

    expect(screen.getByPlaceholderText('Source name')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('https://provider.example:8080')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect Xtream' })
    ).toBeInTheDocument();
  });

  it('clicking a source row logs in and opens dashboard', async () => {
    const user = userEvent.setup();

    vi.mocked(sourcesApi.listRegisteredSources).mockResolvedValue([
      {
        id: 1,
        source_type: 'm3u',
        name: 'M3U',
        config: {},
        created_at: 1000,
      },
      {
        id: 2,
        source_type: 'xtream',
        name: 'Xtream',
        config: {},
        created_at: 2000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<p>Dashboard Route</p>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Xtream');
    const xtreamRow = getSourceRow('Xtream');
    await user.click(xtreamRow);

    expect(await screen.findByText('Dashboard Route')).toBeInTheDocument();
    expect(window.localStorage.getItem('silkcast:lastSelectedSourceId')).toBe(
      '2'
    );
  });

  it('renders row action buttons for each source', async () => {
    vi.mocked(sourcesApi.listRegisteredSources).mockResolvedValue([
      {
        id: 1,
        source_type: 'm3u',
        name: 'Sports',
        config: { location: 'https://example.com/sports.m3u' },
        created_at: 1000,
      },
    ]);

    await renderHomePage();

    const row = getSourceRow('Sports');
    expect(
      within(row).getByRole('button', { name: 'Edit' })
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Refresh' })
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Delete' })
    ).toBeInTheDocument();
  });

  it('deletes a source from its row action after confirmation', async () => {
    const user = userEvent.setup();
    const sports = {
      id: 1,
      source_type: 'm3u',
      name: 'Sports',
      config: { location: 'https://example.com/sports.m3u' },
      created_at: 1000,
    };
    const movies = {
      id: 2,
      source_type: 'm3u',
      name: 'Movies',
      config: { location: 'https://example.com/movies.m3u' },
      created_at: 900,
    };

    resetStore({ selectedSourceId: movies.id, sources: [sports, movies] });
    vi.mocked(sourcesApi.listRegisteredSources)
      .mockResolvedValueOnce([sports, movies])
      .mockResolvedValueOnce([movies]);
    vi.mocked(sourcesApi.deleteRegisteredSource).mockResolvedValue(undefined);

    await renderHomePage();

    const row = getSourceRow('Sports');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete "Sports"?')).toBeInTheDocument();
    expect(sourcesApi.deleteRegisteredSource).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete source' })
    );

    await waitFor(() => {
      expect(sourcesApi.deleteRegisteredSource).toHaveBeenCalledWith(1);
    });

    await waitFor(() => {
      expect(screen.getByText('Deleted "Sports".')).toBeInTheDocument();
    });
  });

  it('keeps the source when deletion is cancelled', async () => {
    const user = userEvent.setup();
    const sports = {
      id: 1,
      source_type: 'm3u',
      name: 'Sports',
      config: { location: 'https://example.com/sports.m3u' },
      created_at: 1000,
    };

    resetStore({ sources: [sports] });
    vi.mocked(sourcesApi.listRegisteredSources).mockResolvedValue([sports]);

    await renderHomePage();

    const row = getSourceRow('Sports');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(sourcesApi.deleteRegisteredSource).not.toHaveBeenCalled();
  });

  it('refreshes a source from its row action', async () => {
    const user = userEvent.setup();
    const news = {
      id: 1,
      source_type: 'm3u',
      name: 'News',
      config: { location: 'https://example.com/news.m3u' },
      created_at: 1000,
    };
    const movies = {
      id: 2,
      source_type: 'm3u',
      name: 'Movies',
      config: { location: 'https://example.com/movies.m3u' },
      created_at: 900,
    };

    resetStore({ selectedSourceId: news.id, sources: [news, movies] });
    vi.mocked(sourcesApi.listRegisteredSources).mockResolvedValue([
      news,
      movies,
    ]);
    vi.mocked(sourcesApi.refreshRegisteredSource).mockResolvedValue({
      source_id: movies.id,
      imported_channels: 8,
    });

    await renderHomePage();

    const row = getSourceRow('Movies');
    await user.click(within(row).getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(sourcesApi.refreshRegisteredSource).toHaveBeenCalledWith(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Refreshed 8 channels.')).toBeInTheDocument();
    });
  });

  it('edits a source from its row action', async () => {
    const user = userEvent.setup();
    const live = {
      id: 1,
      source_type: 'm3u',
      name: 'Live',
      config: { location: 'https://example.com/live.m3u' },
      created_at: 1000,
    };
    const movies = {
      id: 2,
      source_type: 'm3u',
      name: 'Movies',
      config: { location: 'https://example.com/movies.m3u' },
      created_at: 900,
    };

    resetStore({ selectedSourceId: live.id, sources: [live, movies] });
    vi.mocked(sourcesApi.listRegisteredSources)
      .mockResolvedValueOnce([live, movies])
      .mockResolvedValueOnce([
        live,
        {
          ...movies,
          name: 'Movies HD',
          config: { location: 'https://example.com/movies-hd.m3u' },
        },
      ]);
    vi.mocked(sourcesApi.updateRegisteredSource).mockResolvedValue({
      source_id: movies.id,
      imported_channels: 15,
    });

    await renderHomePage();

    const row = getSourceRow('Movies');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const nameInput = screen.getByDisplayValue('Movies');
    const locationInput = screen.getByDisplayValue(
      'https://example.com/movies.m3u'
    );

    await user.clear(nameInput);
    await user.type(nameInput, 'Movies HD');
    await user.clear(locationInput);
    await user.type(locationInput, 'https://example.com/movies-hd.m3u');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(sourcesApi.updateRegisteredSource).toHaveBeenCalledWith(
        2,
        'Movies HD',
        { location: 'https://example.com/movies-hd.m3u', epg_url: '' }
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('Updated source and imported 15 channels.')
      ).toBeInTheDocument();
    });
  });

  it('auto-navigates to dashboard for remembered source ids returned as strings', async () => {
    window.localStorage.setItem('silkcast:lastSelectedSourceId', '2');
    vi.mocked(sourcesApi.listRegisteredSources).mockResolvedValue([
      {
        id: 1,
        source_type: 'm3u',
        name: 'M3U',
        config: {},
        created_at: 1000,
      },
      {
        id: '2' as unknown as number,
        source_type: 'xtream',
        name: 'Xtream',
        config: {},
        created_at: 2000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<p>Dashboard Route</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Dashboard Route')).toBeInTheDocument();
    expect(useAppStore.getState().selectedSourceId).toBe(2);
    expect(useAppStore.getState().hasPersistedSourceSelection).toBe(true);
  });

  it('does not auto-navigate when remembered source is no longer available', async () => {
    window.localStorage.setItem('silkcast:lastSelectedSourceId', '99');
    vi.mocked(sourcesApi.listRegisteredSources).mockResolvedValue([
      {
        id: 1,
        source_type: 'm3u',
        name: 'M3U',
        config: {},
        created_at: 1000,
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<p>Dashboard Route</p>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(sourcesApi.listRegisteredSources).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Dashboard Route')).not.toBeInTheDocument();
    expect(useAppStore.getState().hasPersistedSourceSelection).toBe(false);
    expect(useAppStore.getState().selectedSourceId).toBe(1);
  });
});
