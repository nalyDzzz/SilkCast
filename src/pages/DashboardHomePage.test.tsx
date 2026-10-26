import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ChannelRecord } from '@/components/app/types';
import { DEFAULT_SETTINGS } from '@/components/app/types';
import { listSourceChannels } from '@/lib/api/channelsApi';
import { listSourceGroups } from '@/lib/api/sourcesApi';
import { useAppStore } from '@/store/appStore';
import { DashboardHomePage } from './DashboardHomePage';

vi.mock('@/lib/api/channelsApi', () => ({
  listSourceChannels: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/api/sourcesApi', () => ({
  listSourceGroups: vi.fn(() => Promise.resolve([])),
}));

function channel(
  id: number,
  name: string,
  media_kind: ChannelRecord['media_kind']
): ChannelRecord {
  return {
    id,
    source_id: 3,
    name,
    group_name: 'Group',
    logo: null,
    tvg_id: null,
    tvg_name: null,
    stream_url: `http://provider/${media_kind}/${id}`,
    media_kind,
    is_favorite: false,
  };
}

const news = channel(1, 'News 24', 'live');
const sports = channel(2, 'Sports HD', 'live');
const movie = channel(3, 'Big Movie', 'movie');

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DashboardHomePage />} />
        <Route path="/dashboard/player" element={<p>Player Screen</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DashboardHomePage', () => {
  const playChannelRecord = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSourceGroups).mockImplementation(async (_id, kind) =>
      kind === 'live'
        ? [
            { name: 'News', channel_count: 1200 },
            { name: 'Sports', channel_count: 34 },
          ]
        : [{ name: 'All', channel_count: kind === 'movie' ? 500 : 80 }]
    );
    vi.mocked(listSourceChannels).mockResolvedValue([sports]);
    useAppStore.setState({
      sources: [
        {
          id: 3,
          source_type: 'xtream',
          name: 'My Provider',
          config: {},
          created_at: 1,
        },
      ],
      selectedSourceId: 3,
      recentChannels: [
        { channel: news, played_at: 30 },
        { channel: movie, played_at: 20 },
        { channel: channel(9, 'Other Source', 'live'), played_at: 10 },
      ].map((recent) =>
        recent.channel.id === 9
          ? { ...recent, channel: { ...recent.channel, source_id: 99 } }
          : recent
      ),
      settings: { ...DEFAULT_SETTINGS, preferred_player: 'web' },
      error: null,
      loadRecents: vi.fn(() => Promise.resolve()),
      playChannelRecord,
    });
  });

  it('summarises the catalog and shows rails for the selected source', async () => {
    renderPage();

    expect(screen.getByText('Watching from My Provider')).toBeInTheDocument();
    expect(await screen.findByText('1,234 available')).toBeInTheDocument();
    expect(screen.getByText('500 available')).toBeInTheDocument();
    expect(screen.getByText('80 available')).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Continue watching' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open Big Movie' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play News 24' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Other Source')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Favorite channels' })
    ).toBeInTheDocument();
  });

  it('plays a favorite channel with the favorites as the zapping queue', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Play Sports HD' })
    );

    await waitFor(() => {
      expect(playChannelRecord).toHaveBeenCalledWith(sports, [sports]);
    });
    expect(await screen.findByText('Player Screen')).toBeInTheDocument();
  });
});
