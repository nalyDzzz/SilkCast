import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter } from '../test/renderWithRouter';
import { HomePage } from './HomePage';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useAppStore } from '../store/appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS } from '../components/app/types';
import * as sourcesApi from '../lib/api/sourcesApi';

// Mock the API so loadSources doesn't hit Tauri
vi.mock('../lib/api/sourcesApi', () => ({
  listRegisteredSources: vi.fn(() => Promise.resolve([])),
  listSourceGroups: vi.fn(() => Promise.resolve([])),
  addM3uSource: vi.fn(),
  addXtreamSource: vi.fn(),
  refreshRegisteredSource: vi.fn(),
  deleteRegisteredSource: vi.fn(),
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

describe('HomePage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(sourcesApi.listRegisteredSources).mockResolvedValue([]);
  });

  it('renders the OpenTV heading', async () => {
    await renderHomePage();
    expect(screen.getByRole('heading', { name: 'OpenTV' })).toBeInTheDocument();
  });

  it('renders the import description text', async () => {
    await renderHomePage();
    expect(
      screen.getByText(/Import an M3U playlist or connect an Xtream provider/)
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

  it('disables Log In button when no source is selected', async () => {
    await renderHomePage();
    expect(
      screen.getByRole('button', { name: 'Log In To Dashboard' })
    ).toBeDisabled();
  });

  it('disables delete button when no source is selected', async () => {
    await renderHomePage();
    expect(
      screen.getByRole('button', { name: 'Delete Selected Source' })
    ).toBeDisabled();
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

  it('lets you type into xtream inputs', async () => {
    const user = userEvent.setup();
    await renderHomePage();

    await user.click(screen.getByRole('button', { name: 'Xtream Provider' }));

    const sourceNameInput = screen.getByPlaceholderText('Source name');
    const usernameInput = screen.getByPlaceholderText('Username');

    await user.type(sourceNameInput, 'Provider One');
    await user.type(usernameInput, 'alice');

    expect(sourceNameInput).toHaveValue('Provider One');
    expect(usernameInput).toHaveValue('alice');
  });

  it('deletes the selected playlist after confirmation', async () => {
    const user = userEvent.setup();
    const source = {
      id: 1,
      source_type: 'm3u',
      name: 'Sports',
      config: {},
      created_at: 1000,
    };

    resetStore({ sources: [source], selectedSourceId: source.id });
    vi.mocked(sourcesApi.listRegisteredSources)
      .mockResolvedValueOnce([source])
      .mockResolvedValueOnce([]);
    vi.mocked(sourcesApi.deleteRegisteredSource).mockResolvedValue(undefined);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await renderHomePage();
    await user.click(
      screen.getByRole('button', { name: 'Delete Selected Source' })
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete "Sports"? This removes the source and its imported catalog.'
    );

    await waitFor(() => {
      expect(sourcesApi.deleteRegisteredSource).toHaveBeenCalledWith(1);
    });

    await waitFor(() => {
      expect(screen.getByText('Deleted "Sports".')).toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('auto-navigates to dashboard for remembered xtream source ids returned as strings', async () => {
    window.localStorage.setItem('opentv:lastSelectedSourceId', '2');
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
    window.localStorage.setItem('opentv:lastSelectedSourceId', '99');
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
