import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { useUpdateToast } from '@/components/updates/useUpdateToast';
import { installAppUpdate, type Update } from '@/lib/api/updatesApi';
import { useAppUpdateStore } from '@/store/appUpdateStore';

vi.mock('@/lib/api/updatesApi', () => ({
  checkForAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn(), error: vi.fn() }),
}));

const fakeUpdate = (version: string) => ({ version }) as Update;

describe('useUpdateToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useAppUpdateStore.setState({ phase: 'idle', update: null });
  });

  it('says nothing without an update', () => {
    renderHook(() => useUpdateToast());

    expect(toast).not.toHaveBeenCalled();
  });

  it('announces an update as soon as it is found', () => {
    renderHook(() => useUpdateToast());

    act(() => useAppUpdateStore.setState({ update: fakeUpdate('0.5.0') }));

    expect(toast).toHaveBeenCalledWith('SilkCast 0.5.0 is available', expect.anything());
  });

  it('can start the install from the toast', () => {
    const update = fakeUpdate('0.5.0');
    vi.mocked(installAppUpdate).mockReturnValue(new Promise(() => undefined));
    useAppUpdateStore.setState({ update });
    renderHook(() => useUpdateToast());

    const options = vi.mocked(toast).mock.calls[0][1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();

    expect(installAppUpdate).toHaveBeenCalledWith(update, expect.any(Function));
  });

  it('announces each version only once, across launches', () => {
    useAppUpdateStore.setState({ update: fakeUpdate('0.5.0') });
    const firstLaunch = renderHook(() => useUpdateToast());
    firstLaunch.unmount();
    renderHook(() => useUpdateToast());

    expect(toast).toHaveBeenCalledOnce();

    act(() => useAppUpdateStore.setState({ update: fakeUpdate('0.6.0') }));

    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenLastCalledWith('SilkCast 0.6.0 is available', expect.anything());
  });

  it('holds back while an install is already running', () => {
    useAppUpdateStore.setState({ phase: 'downloading', update: fakeUpdate('0.5.0') });
    renderHook(() => useUpdateToast());

    expect(toast).not.toHaveBeenCalled();
  });

  it('clears the toast when leaving for the player', () => {
    useAppUpdateStore.setState({ update: fakeUpdate('0.5.0') });
    const { unmount } = renderHook(() => useUpdateToast());

    unmount();

    expect(toast.dismiss).toHaveBeenCalledWith('app-update-available');
  });
});
