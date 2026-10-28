import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ChannelRecord } from '@/components/app/types';
import { DEFAULT_SETTINGS } from '@/components/app/types';
import { clearScheduleCache } from '@/components/epg/useChannelSchedules';
import { resumeKeyFor } from '@/components/player/hooks/useResumeTracking';
import { listSourceChannels } from '@/lib/api/channelsApi';
import { listChannelsEpg } from '@/lib/api/epgApi';
import { listSourceGroups } from '@/lib/api/sourcesApi';
import { useAppStore } from '@/store/appStore';
import { DashboardHomePage } from './DashboardHomePage';

vi.mock('@/lib/api/channelsApi', () => ({
  listSourceChannels: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/lib/api/sourcesApi', () => ({
  listSourceGroups: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/lib/api/epgApi', () => ({
  listChannelsEpg: vi.fn(() => Promise.resolve([])),
}));

function channel(id: number, name: string, media_kind: ChannelRecord['media_kind']): ChannelRecord {
  return {
    id,
    source_id: 3,
    name,
    group_name: 'EN - DRAMA',
    logo: null,
    tvg_id: null,
    tvg_name: null,
    stream_url: `http://provider/${media_kind}/u/p/${id}.mkv`,
    media_kind,
    is_favorite: false,
  };
}

const news = channel(1, 'US| NEWS 24 HD', 'live');
const sports = channel(2, 'UK| SPORTS ONE FHD', 'live');
const movie = channel(3, '4K-A+ - Glass Orchard (2024)', 'movie');

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
    clearScheduleCache();
    vi.mocked(listSourceGroups).mockImplementation(async (_id, kind) =>
      kind === 'live'
        ? [
            { name: 'News', channel_count: 1200 },
            { name: 'Sports', channel_count: 34 },
          ]
        : [{ name: 'All', channel_count: kind === 'movie' ? 500 : 80 }]
    );
    vi.mocked(listSourceChannels).mockResolvedValue([sports]);
    const now = Math.floor(Date.now() / 1000);
    vi.mocked(listChannelsEpg).mockImplementation(async (channelIds) =>
      channelIds.includes(sports.id)
        ? [
            {
              channel_id: sports.id,
              entries: [
                {
                  title: 'Premier Rugby',
                  description: null,
                  start: null,
                  end: null,
                  start_timestamp: now - 600,
                  end_timestamp: now + 1200,
                },
              ],
            },
          ]
        : []
    );
    useAppStore.setState({
      sources: [{ id: 3, source_type: 'xtream', name: 'My Provider', config: {}, created_at: 1 }],
      selectedSourceId: 3,
      recentChannels: [
        { channel: news, played_at: 30 },
        { channel: movie, played_at: 20 },
        { channel: { ...channel(9, 'Other Source', 'movie'), source_id: 99 }, played_at: 10 },
      ],
      settings: { ...DEFAULT_SETTINGS, preferred_player: 'web' },
      error: null,
      loadRecents: vi.fn(() => Promise.resolve()),
      playChannelRecord,
    });
  });

  it('features the movie to resume and lists what is on now', async () => {
    window.localStorage.setItem(
      'silkcast:player:resumePositions',
      JSON.stringify({ [resumeKeyFor(movie)]: { position: 3600, duration: 6000, updatedAt: 1 } })
    );
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Glass Orchard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getAllByText('40 min left').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Resume Glass Orchard' })).toBeInTheDocument();
    expect(screen.queryByText('Other Source')).not.toBeInTheDocument();

    expect(await screen.findByRole('button', { name: 'Play Sports One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play News 24' })).toBeInTheDocument();
    expect(await screen.findByText('Premier Rugby')).toBeInTheDocument();
    expect(await screen.findByText('1,234 available')).toBeInTheDocument();
  });

  it('plays an on-now channel with the rail as the zapping queue', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Play Sports One' }));

    await waitFor(() => {
      expect(playChannelRecord).toHaveBeenCalledWith(sports, [sports, news]);
    });
    expect(await screen.findByText('Player Screen')).toBeInTheDocument();
  });

  it('invites browsing when nothing has been watched', async () => {
    vi.mocked(listSourceChannels).mockResolvedValue([]);
    useAppStore.setState({ recentChannels: [] });
    renderPage();

    const hero = screen.getByRole('heading', { level: 1, name: 'Pick something to watch' });
    expect(hero).toBeInTheDocument();
    expect(within(hero.closest('section')!).getByRole('link', { name: /Browse Live TV/ })).toHaveAttribute(
      'href',
      '/dashboard/live'
    );
  });
});
