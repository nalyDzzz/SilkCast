import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUpdateChecks } from '@/components/updates/useUpdateChecks';
import { checkForAppUpdate } from '@/lib/api/updatesApi';
import { useAppUpdateStore } from '@/store/appUpdateStore';

vi.mock('@/lib/api/updatesApi', () => ({
  checkForAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
}));

const SIX_HOURS = 6 * 60 * 60 * 1000;

describe('useUpdateChecks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(checkForAppUpdate).mockResolvedValue(null);
    useAppUpdateStore.setState({ phase: 'idle', update: null, upToDate: false, checkError: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('checks shortly after launch, then every six hours', async () => {
    vi.stubEnv('PROD', true);
    renderHook(() => useUpdateChecks());

    expect(checkForAppUpdate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SIX_HOURS);
    expect(checkForAppUpdate).toHaveBeenCalledTimes(2);
  });

  it('stops checking once unmounted', async () => {
    vi.stubEnv('PROD', true);
    const { unmount } = renderHook(() => useUpdateChecks());

    unmount();
    await vi.advanceTimersByTimeAsync(SIX_HOURS);

    expect(checkForAppUpdate).not.toHaveBeenCalled();
  });

  it('never checks in dev builds', async () => {
    vi.stubEnv('PROD', false);
    renderHook(() => useUpdateChecks());

    await vi.advanceTimersByTimeAsync(SIX_HOURS);

    expect(checkForAppUpdate).not.toHaveBeenCalled();
  });
});
