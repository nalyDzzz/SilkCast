import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter } from '../test/renderWithRouter';
import { SettingsPage } from './SettingsPage';
import { useAppStore } from '../store/appStore';
import { ALL_GROUPS, DEFAULT_SETTINGS } from '../components/app/types';
import { checkForAppUpdate, installAppUpdate, type Update } from '../lib/api/updatesApi';
import { useAppUpdateStore } from '../store/appUpdateStore';

vi.mock('../lib/api/updatesApi', () => ({
  checkForAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
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
    theme: 'light',
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

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    useAppUpdateStore.setState({
      phase: 'idle',
      update: null,
      upToDate: false,
      checkError: null,
      downloadedBytes: 0,
      downloadTotalBytes: null,
    });
  });

  it('renders the heading', () => {
    renderWithRouter(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: 'Settings' })
    ).toBeInTheDocument();
  });

  it('renders playback settings controls', () => {
    renderWithRouter(<SettingsPage />);
    expect(screen.getByText('Playback')).toBeInTheDocument();
    expect(screen.getByText('Default Player')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save Settings' })
    ).toBeInTheDocument();
  });

  it('shows settings that finish loading after the page opens', () => {
    renderWithRouter(<SettingsPage />);
    const playerSelect = screen.getByRole('combobox', {
      name: 'Default player',
    });
    expect(playerSelect).toHaveTextContent('In-app player');

    act(() => {
      useAppStore.setState({
        settings: { ...DEFAULT_SETTINGS, preferred_player: 'mpv' },
      });
    });

    expect(playerSelect).toHaveTextContent('MPV pop-out window');
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled();
  });

  it('reflects theme changes in appearance controls', () => {
    renderWithRouter(<SettingsPage />);

    const themeSelect = screen.getByRole('combobox', { name: 'Theme' });
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(themeSelect).toHaveTextContent('Light');

    act(() => {
      useAppStore.getState().setTheme('dark');
    });

    expect(themeSelect).toHaveTextContent('Dark');
  });

  it('checks for app updates from settings', async () => {
    vi.mocked(checkForAppUpdate).mockResolvedValue(null);
    const user = userEvent.setup();

    renderWithRouter(<SettingsPage />);
    await user.click(screen.getByRole('button', { name: 'Check for Updates' }));

    expect(checkForAppUpdate).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('SilkCast is up to date.')
    ).toBeInTheDocument();
  });

  it('offers an update that an automatic check already found', async () => {
    const update = { version: '0.5.0' } as Update;
    vi.mocked(installAppUpdate).mockResolvedValue();
    useAppUpdateStore.setState({ update });
    const user = userEvent.setup();

    renderWithRouter(<SettingsPage />);
    expect(screen.getByText('Version 0.5.0 is ready to install.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install Update' }));

    expect(installAppUpdate).toHaveBeenCalledWith(update, expect.any(Function));
  });
});
