import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { renderWithRouter } from '../test/renderWithRouter';
import { RecentsPage } from './RecentsPage';
import { useAppStore } from '../store/appStore';
import {
  ALL_GROUPS,
  DEFAULT_SETTINGS,
  type BackendEvent,
  type RecentChannelRecord,
} from '../components/app/types';
import { subscribeBackendEvents } from '../lib/api/eventsApi';

vi.mock('../lib/api/eventsApi', () => ({
  subscribeBackendEvents: vi.fn(() => Promise.resolve(() => {})),
}));

function makeRecent(
  id: number,
  sourceId: number,
  name: string,
  mediaKind: 'live' | 'movie' | 'series',
  playedAt: number
): RecentChannelRecord {
  return {
    channel: {
      id,
      source_id: sourceId,
      name,
      group_name: 'Group',
      logo: null,
      tvg_id: null,
      tvg_name: null,
      stream_url: `https://example.com/${id}.m3u8`,
      media_kind: mediaKind,
      is_favorite: false,
    },
    played_at: playedAt,
  };
}

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
    setError: vi.fn(),
    loadSources: vi.fn(() => Promise.resolve()),
    loadSettings: vi.fn(() => Promise.resolve()),
    loadRecents: vi.fn(() => Promise.resolve()),
    loadPlaybackStatus: vi.fn(() => Promise.resolve()),
    setPlayback: vi.fn(),
    playChannel: vi.fn(() => Promise.resolve()),
    playChannelRecord: vi.fn(() => Promise.resolve()),
    ...overrides,
  });
}

describe('RecentsPage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('loads recents and filters by selected source and media kind', async () => {
    const user = userEvent.setup();
    const loadSources = vi.fn(() => Promise.resolve());
    const loadRecents = vi.fn(() => Promise.resolve());

    resetStore({
      selectedSourceId: 42,
      sources: [
        {
          id: 42,
          source_type: 'm3u',
          name: 'Primary Source',
          config: {},
          created_at: 1000,
        },
        {
          id: 99,
          source_type: 'm3u',
          name: 'Other Source',
          config: {},
          created_at: 1001,
        },
      ],
      recentChannels: [
        makeRecent(11, 42, 'Live One', 'live', 1_700_000_000),
        makeRecent(12, 42, 'Movie One', 'movie', 1_700_000_010),
        makeRecent(13, 99, 'Other Source Live', 'live', 1_700_000_020),
      ],
      loadSources,
      loadRecents,
    });

    renderWithRouter(<RecentsPage />, {
      initialEntries: ['/dashboard/recents'],
    });

    expect(screen.getByRole('heading', { name: 'Watch history' })).toBeInTheDocument();
    expect(
      screen.getByText('What you watched on Primary Source, newest first.')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(loadSources).toHaveBeenCalledTimes(1);
      expect(loadRecents).toHaveBeenCalledTimes(1);
      expect(subscribeBackendEvents).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Live One')).toBeInTheDocument();
    expect(screen.queryByText('Movie One')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Source Live')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Movies' }));

    expect(await screen.findByText('Movie One')).toBeInTheDocument();
    expect(screen.queryByText('Live One')).not.toBeInTheDocument();
  });

  it('reloads recents when the backend emits recents_updated', async () => {
    const loadRecents = vi.fn(() => Promise.resolve());
    let listener: ((event: BackendEvent) => void) | undefined;

    vi.mocked(subscribeBackendEvents).mockImplementationOnce(
      async (nextListener) => {
        listener = nextListener;
        return () => {};
      }
    );

    resetStore({
      selectedSourceId: 42,
      sources: [
        {
          id: 42,
          source_type: 'm3u',
          name: 'Primary Source',
          config: {},
          created_at: 1000,
        },
      ],
      loadRecents,
    });

    renderWithRouter(<RecentsPage />, {
      initialEntries: ['/dashboard/recents'],
    });

    await waitFor(() => {
      expect(loadRecents).toHaveBeenCalledTimes(1);
      expect(listener).toBeDefined();
    });

    listener?.({ event: 'sources_updated', payload: {}, ts: 1 });
    await waitFor(() => {
      expect(loadRecents).toHaveBeenCalledTimes(1);
    });

    listener?.({ event: 'recents_updated', payload: {}, ts: 2 });
    await waitFor(() => {
      expect(loadRecents).toHaveBeenCalledTimes(2);
    });
  });

  it('redirects to home when no source is selected', async () => {
    const loadSources = vi.fn(() => Promise.resolve());
    const loadRecents = vi.fn(() => Promise.resolve());

    resetStore({
      selectedSourceId: null,
      loadSources,
      loadRecents,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard/recents']}>
        <Routes>
          <Route path="/" element={<p>Home Screen</p>} />
          <Route path="/dashboard/recents" element={<RecentsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Home Screen')).toBeInTheDocument();
    expect(loadSources).not.toHaveBeenCalled();
    expect(loadRecents).not.toHaveBeenCalled();
  });

  it('plays a recent item and navigates to player when preferred player is web', async () => {
    const user = userEvent.setup();
    const playChannel = vi.fn(() => Promise.resolve());

    resetStore({
      selectedSourceId: 42,
      sources: [
        {
          id: 42,
          source_type: 'm3u',
          name: 'Primary Source',
          config: {},
          created_at: 1000,
        },
      ],
      recentChannels: [makeRecent(11, 42, 'Live One', 'live', 1_700_000_000)],
      settings: { ...DEFAULT_SETTINGS, preferred_player: 'web' },
      playChannel,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard/recents']}>
        <Routes>
          <Route path="/dashboard/recents" element={<RecentsPage />} />
          <Route path="/dashboard/player" element={<p>Player Screen</p>} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByText('Live One'));

    await waitFor(() => {
      expect(playChannel).toHaveBeenCalledWith(11);
    });
    expect(await screen.findByText('Player Screen')).toBeInTheDocument();
  });
});
