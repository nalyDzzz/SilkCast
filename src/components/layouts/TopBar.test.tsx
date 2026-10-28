import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ALL_GROUPS, DEFAULT_SETTINGS, type ChannelRecord } from '@/components/app/types';
import { CommandPalette } from '@/components/command/CommandPalette';
import { useCommandPaletteStore } from '@/components/command/commandPaletteStore';
import { TopBar } from '@/components/layouts/TopBar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { listSourceChannels } from '@/lib/api/channelsApi';
import { refreshSourceEpg } from '@/lib/api/epgApi';
import { listSourceGroups } from '@/lib/api/sourcesApi';
import { useAppStore } from '@/store/appStore';
import { useSourceActivityStore } from '@/store/sourceActivityStore';
import { sourceRecord } from '@/test/sourceRecord';

vi.mock('@/lib/api/channelsApi', () => ({
  listSourceChannels: vi.fn(),
  setChannelFavoriteState: vi.fn(),
}));
vi.mock('@/lib/api/epgApi', () => ({ refreshSourceEpg: vi.fn() }));
vi.mock('@/lib/api/sourcesApi', () => ({ listSourceGroups: vi.fn() }));

const sources = [
  sourceRecord({ id: 7, source_type: 'xtream', name: 'Tidewater' }),
  sourceRecord({ id: 8, source_type: 'm3u', name: 'Home playlist' }),
];

const channel = (id: number, name: string): ChannelRecord => ({
  id,
  source_id: 7,
  name,
  group_name: 'UK| SPORTS',
  logo: null,
  tvg_id: null,
  tvg_name: null,
  stream_url: `http://x/live/u/p/${id}.ts`,
  media_kind: 'live',
  is_favorite: false,
});

function renderTopBar(path = '/dashboard/live') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <TopBar />
        <CommandPalette />
      </TooltipProvider>
    </MemoryRouter>
  );
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommandPaletteStore.setState({ open: false });
    useSourceActivityStore.setState({
      refreshingSourceId: null,
      refreshingGuideSourceId: null,
      guideUpdatedAt: {},
    });
    useAppStore.setState({
      sources,
      selectedSourceId: 7,
      selectedGroup: ALL_GROUPS,
      recentChannels: [],
      settings: DEFAULT_SETTINGS,
      error: null,
      importMessage: null,
    });
    vi.mocked(listSourceGroups).mockResolvedValue([]);
  });

  it('shows the sections, marking the current one', () => {
    renderTopBar('/dashboard/live');
    expect(screen.getByRole('link', { name: 'Live TV' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('keeps refresh actions in the source switcher', async () => {
    const user = userEvent.setup();
    vi.mocked(refreshSourceEpg).mockResolvedValue({
      source_id: 7,
      refreshed_channels: 1,
      channels_with_listings: 1,
      failed_channels: 0,
      skipped_channels: 0,
    });
    renderTopBar();

    await user.click(screen.getByRole('button', { name: 'Source: Tidewater' }));
    expect(await screen.findByRole('menuitem', { name: /Refresh source/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Home playlist/ })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Refresh guide/ }));

    expect(refreshSourceEpg).toHaveBeenCalledWith(7);
    expect(useSourceActivityStore.getState().refreshingGuideSourceId).toBe(7);
  });

  it('switches sources from the menu', async () => {
    const user = userEvent.setup();
    renderTopBar();

    await user.click(screen.getByRole('button', { name: 'Source: Tidewater' }));
    await user.click(await screen.findByRole('menuitem', { name: /Home playlist/ }));

    expect(useAppStore.getState().selectedSourceId).toBe(8);
  });

  it('opens the command palette with Ctrl K and searches the catalog', async () => {
    const user = userEvent.setup();
    vi.mocked(listSourceChannels).mockResolvedValue([
      channel(1, 'UK| ARC SPORTS 1 FHD'),
      channel(2, '##### UK SPORTS #####'),
    ]);
    renderTopBar();

    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByPlaceholderText('Search channels, movies and series');
    await user.type(input, 'arc');

    expect(await screen.findByText('Arc Sports 1')).toBeInTheDocument();
    await waitFor(() =>
      expect(listSourceChannels).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 7, query: 'arc', mediaKind: null })
      )
    );
    expect(screen.queryByText(/UK SPORTS/)).not.toBeInTheDocument();
  });
});
