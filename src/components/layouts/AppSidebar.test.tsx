import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAppStore } from '@/store/appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS } from '@/components/app/types';

function renderSidebar(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>
  );
}

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

describe('AppSidebar', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('renders the recents navigation item', () => {
    const logout = vi.fn();

    resetStore({
      selectedSourceId: 7,
      refreshSource: vi.fn().mockResolvedValue(undefined),
      logout,
    });

    renderSidebar('/dashboard/live');

    expect(screen.getByRole('link', { name: /Recents/i })).toBeInTheDocument();
  });

  it.each([
    ['/dashboard/live', 'live'],
    ['/dashboard/movies', 'movie'],
    ['/dashboard/series', 'series'],
    ['/dashboard/recents', 'live'],
  ] as const)(
    'refreshes source with %s media filter',
    async (path, expectedMediaKind) => {
      const user = userEvent.setup();
      const refreshSource = vi.fn().mockResolvedValue(undefined);
      const logout = vi.fn();

      resetStore({
        selectedSourceId: 7,
        refreshSource,
        logout,
      });

      renderSidebar(path);
      await user.click(screen.getByRole('button', { name: /Refresh Source/i }));

      expect(refreshSource).toHaveBeenCalledWith(7, expectedMediaKind);
    }
  );
});
