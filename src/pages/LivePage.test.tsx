import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter } from '../test/renderWithRouter';
import { LivePage } from './LivePage';
import { useAppStore } from '../store/appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS, type ChannelRecord } from '../components/app/types';
import { clearScheduleCache } from '../components/epg/useChannelSchedules';
import { listSourceChannels } from '../lib/api/channelsApi';
import { listChannelEpg } from '../lib/api/epgApi';
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
vi.mock('../lib/api/epgApi', () => ({
  listChannelEpg: vi.fn(() => Promise.resolve([])),
  refreshChannelEpg: vi.fn(() => Promise.resolve([])),
  refreshSourceEpg: vi.fn(() => Promise.resolve({})),
}));

const live = (id: number, name: string): ChannelRecord => ({
  id,
  source_id: 12,
  name,
  group_name: 'UK| SPORTS',
  logo: null,
  tvg_id: null,
  tvg_name: null,
  stream_url: `http://provider/live/u/p/${id}.ts`,
  media_kind: 'live',
  is_favorite: false,
});

const arc = live(1, 'UK| ARC SPORTS 1 FHD');
const news = live(2, 'US| HARBOR NEWS 24 HD');

function resetStore(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    sources: [{ id: 12, source_type: 'xtream', name: 'Tidewater', config: {}, created_at: 0 }],
    selectedSourceId: 12,
    hasPersistedSourceSelection: false,
    groups: [],
    selectedGroup: ALL_GROUPS,
    channels: [],
    recentChannels: [],
    activeChannel: null,
    playback: null,
    settings: DEFAULT_SETTINGS,
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

// The channel list and guide are virtualized; give jsdom a viewport to fill.
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});
afterAll(() => {
  if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
});

const renderLive = () => renderWithRouter(<LivePage />, { initialEntries: ['/dashboard/live'] });

describe('LivePage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    clearScheduleCache();
    window.localStorage.removeItem('silkcast:liveView');
  });

  it('loads live groups and channels for the selected source', async () => {
    const loadRecents = vi.fn(() => Promise.resolve());
    const loadPlaybackStatus = vi.fn(() => Promise.resolve());
    resetStore({ loadRecents, loadPlaybackStatus });

    renderLive();

    expect(screen.getByRole('heading', { name: 'Live TV' })).toBeInTheDocument();
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

  it('shows an empty state with a way out when no channels match', async () => {
    renderLive();

    expect(await screen.findByText('No channels match these filters.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search channels')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favorites', pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('previews the selected channel with its guide and watches on Enter', async () => {
    const user = userEvent.setup();
    const playChannelRecord = vi.fn(() => Promise.resolve());
    resetStore({ playChannelRecord });
    vi.mocked(listSourceChannels).mockResolvedValue([arc, news]);
    const now = Math.floor(Date.now() / 1000);
    vi.mocked(listChannelEpg).mockImplementation(async (channelId) =>
      channelId === news.id
        ? [
            { title: 'The Evening Ledger', description: 'Headlines.', start: null, end: null, start_timestamp: now - 600, end_timestamp: now + 1800 },
            { title: 'Weather Coast to Coast', description: null, start: null, end: null, start_timestamp: now + 1800, end_timestamp: now + 3600 },
          ]
        : []
    );

    renderLive();

    const list = await screen.findByRole('listbox', { name: 'Channels' });
    expect(within(list).getByRole('option', { name: 'Arc Sports 1', selected: true })).toBeInTheDocument();

    await user.click(within(list).getByRole('option', { name: 'Harbor News 24' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'The Evening Ledger' })).toBeInTheDocument();
    expect(screen.getByText('Weather Coast to Coast')).toBeInTheDocument();

    list.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(playChannelRecord).toHaveBeenCalledWith(news, [arc, news]));
  });

  it('switches to the guide view and remembers it', async () => {
    const user = userEvent.setup();
    vi.mocked(listSourceChannels).mockResolvedValue([arc]);
    renderLive();

    await user.click(await screen.findByRole('tab', { name: 'Guide' }));

    expect(await screen.findByRole('button', { name: 'Watch Arc Sports 1' })).toBeInTheDocument();
    expect(window.localStorage.getItem('silkcast:liveView')).toBe('guide');
  });
});
