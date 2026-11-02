import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UpdateIndicator } from '@/components/updates/UpdateIndicator';
import { installAppUpdate, openReleaseNotes, type Update } from '@/lib/api/updatesApi';
import { useAppUpdateStore } from '@/store/appUpdateStore';

vi.mock('@/lib/api/updatesApi', () => ({
  checkForAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
  openReleaseNotes: vi.fn(() => Promise.resolve()),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const update = { version: '0.5.0', currentVersion: '0.4.1' } as Update;

function renderIndicator() {
  return render(
    <TooltipProvider>
      <UpdateIndicator />
    </TooltipProvider>
  );
}

describe('UpdateIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppUpdateStore.setState({
      phase: 'idle',
      update,
      upToDate: false,
      checkError: null,
      downloadedBytes: 0,
      downloadTotalBytes: null,
    });
  });

  it('stays out of the way until there is an update', () => {
    useAppUpdateStore.setState({ update: null });
    renderIndicator();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers the new version, its notes and the install', async () => {
    const user = userEvent.setup();
    vi.mocked(installAppUpdate).mockReturnValue(new Promise(() => undefined));
    renderIndicator();

    await user.click(screen.getByRole('button', { name: 'Update available' }));
    expect(await screen.findByText('SilkCast 0.5.0 is available')).toBeInTheDocument();
    expect(screen.getByText(/You have 0\.4\.1/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "What's new" }));
    expect(openReleaseNotes).toHaveBeenCalledWith('0.5.0');

    await user.click(screen.getByRole('button', { name: 'Install and restart' }));
    expect(installAppUpdate).toHaveBeenCalledWith(update, expect.any(Function));
  });

  it('shows download progress in place of the actions', async () => {
    const user = userEvent.setup();
    useAppUpdateStore.setState({
      phase: 'downloading',
      downloadedBytes: 42,
      downloadTotalBytes: 100,
    });
    renderIndicator();

    await user.click(screen.getByRole('button', { name: 'Updating 42%' }));

    expect(await screen.findByText('Downloading… 42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Update download' })).toHaveAttribute(
      'aria-valuenow',
      '42'
    );
    expect(screen.queryByRole('button', { name: 'Install and restart' })).not.toBeInTheDocument();
  });

  it('copes with a download of unknown size', () => {
    useAppUpdateStore.setState({ phase: 'downloading' });
    renderIndicator();

    expect(screen.getByRole('button', { name: 'Updating' })).toBeInTheDocument();
  });

  it('says when it is restarting', () => {
    useAppUpdateStore.setState({ phase: 'installing' });
    renderIndicator();

    expect(screen.getByRole('button', { name: 'Restarting…' })).toBeInTheDocument();
  });

  it('reports a failed install and offers it again', async () => {
    const user = userEvent.setup();
    vi.mocked(installAppUpdate).mockRejectedValue('signature verification failed');
    renderIndicator();

    await user.click(screen.getByRole('button', { name: 'Update available' }));
    await user.click(await screen.findByRole('button', { name: 'Install and restart' }));

    expect(toast.error).toHaveBeenCalledWith("Couldn't install the update", {
      description: 'signature verification failed',
    });
    expect(await screen.findByRole('button', { name: 'Install and restart' })).toBeInTheDocument();
  });

  it('follows the store while the popover is closed', () => {
    renderIndicator();

    act(() => useAppUpdateStore.setState({ update: null }));

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
